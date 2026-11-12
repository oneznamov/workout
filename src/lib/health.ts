import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { healthMetrics, healthWorkouts, workouts, type HrSample } from "@/db/schema";
import { dayOf } from "./format";
import { METRIC_INFO } from "./labels";

// ───────────────────────── Parsing ─────────────────────────

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/** Accepts ISO strings and Health Auto Export's "2026-01-15 07:30:00 +0200". */
export function parseDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(v < 1e12 ? v * 1000 : v);
  if (typeof v !== "string" || !v.trim()) return null;
  let s = v.trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)\s*([+-]\d{2}):?(\d{2})$/);
  if (m) s = `${m[1]}T${m[2].length === 5 ? `${m[2]}:00` : m[2]}${m[3]}:${m[4]}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Reads a number from `5`, `"5"`, or `{ qty: 5, units }`. */
function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  if (isObj(v)) return num(v.qty ?? v.value ?? v.avg ?? v.Avg);
  return null;
}
const unitOf = (v: unknown): string => (isObj(v) && typeof v.units === "string" ? v.units : "");

function toKcal(v: unknown): number | null {
  const n = num(v);
  if (n == null) return null;
  return /kj/i.test(unitOf(v)) ? n / 4.184 : n;
}
function toMeters(v: unknown): number | null {
  const n = num(v);
  if (n == null) return null;
  const u = unitOf(v).toLowerCase();
  if (u === "km") return n * 1000;
  if (u === "mi") return n * 1609.344;
  return n;
}

const METRIC_ALIASES: Record<string, string> = {
  weight_body_mass: "body_mass",
  weight: "body_mass",
  body_weight: "body_mass",
  body_fat: "body_fat_percentage",
  resting_hr: "resting_heart_rate",
  hrv: "heart_rate_variability",
  heart_rate_variability_sdnn: "heart_rate_variability",
  vo2max: "vo2_max",
  steps: "step_count",
  active_energy_burned: "active_energy",
  basal_energy: "basal_energy_burned",
  resting_energy: "basal_energy_burned",
  exercise_time: "apple_exercise_time",
  exercise_minutes: "apple_exercise_time",
  stand_time: "apple_stand_time",
  walking_running_distance: "walking_running_distance",
  distance_walking_running: "walking_running_distance",
  sleep: "sleep_analysis",
};
const metricKey = (name: string) => {
  const k = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return METRIC_ALIASES[k] ?? k;
};

/** Normalises a value into the unit we store for that metric. */
function normaliseMetric(metric: string, value: number, units: string): number {
  const u = units.toLowerCase();
  switch (metric) {
    case "body_mass":
    case "lean_body_mass":
      return u.startsWith("lb") ? value * 0.45359237 : value;
    case "active_energy":
    case "basal_energy_burned":
      return u === "kj" ? value / 4.184 : value;
    case "walking_running_distance":
      return u === "mi" ? value * 1.609344 : u === "m" ? value / 1000 : value;
    case "body_fat_percentage":
    case "blood_oxygen_saturation":
      return value <= 1 ? value * 100 : value;
    case "sleep_analysis":
      return u.startsWith("min") ? value / 60 : value;
    default:
      return value;
  }
}

type MetricPoint = { metric: string; day: string; value: number };
type WorkoutPoint = {
  externalId: string;
  activityType: string;
  startAt: Date;
  endAt: Date;
  durationSec: number | null;
  activeKcal: number | null;
  totalKcal: number | null;
  avgHr: number | null;
  maxHr: number | null;
  minHr: number | null;
  distanceM: number | null;
  hrSamples: HrSample[] | null;
};

function parseMetrics(list: unknown[]): MetricPoint[] {
  const buckets = new Map<string, { metric: string; day: string; values: number[] }>();
  const push = (metric: string, date: Date, value: number) => {
    const day = dayOf(date);
    const key = `${metric}|${day}`;
    const b = buckets.get(key) ?? { metric, day, values: [] };
    b.values.push(value);
    buckets.set(key, b);
  };

  for (const item of list) {
    if (!isObj(item)) continue;
    const metric = metricKey(String(item.name ?? item.metric ?? ""));
    if (!metric) continue;
    const units = String(item.units ?? item.unit ?? "");
    // Flat form: { metric, date, value, unit }
    const points = Array.isArray(item.data) ? item.data : [item];
    for (const p of points) {
      if (!isObj(p)) continue;
      const date = parseDate(p.date ?? p.day ?? p.start ?? p.startDate);
      if (!date) continue;
      let value: number | null;
      if (metric === "sleep_analysis") {
        value = num(p.totalSleep) ?? num(p.asleep) ?? num(p.qty) ?? num(p.value);
      } else if (metric === "heart_rate") {
        value = num(p.Avg) ?? num(p.avg) ?? num(p.qty) ?? num(p.value);
      } else {
        value = num(p.qty) ?? num(p.value) ?? num(p.Avg) ?? num(p.avg);
      }
      if (value == null) continue;
      push(metric, date, normaliseMetric(metric, value, units));
    }
  }

  return [...buckets.values()].map(({ metric, day, values }) => {
    const agg = METRIC_INFO[metric]?.agg ?? "avg";
    const value =
      agg === "sum"
        ? values.reduce((a, b) => a + b, 0)
        : agg === "last"
          ? values[values.length - 1]
          : values.reduce((a, b) => a + b, 0) / values.length;
    return { metric, day, value };
  });
}

function parseHrSamples(v: unknown): HrSample[] | null {
  if (!Array.isArray(v)) return null;
  const out: HrSample[] = [];
  for (const p of v) {
    if (!isObj(p)) continue;
    const t = parseDate(p.date ?? p.t ?? p.time ?? p.timestamp);
    const bpm = num(p.Avg) ?? num(p.avg) ?? num(p.bpm) ?? num(p.qty) ?? num(p.value);
    if (t && bpm != null && bpm > 20 && bpm < 260) out.push({ t: t.toISOString(), bpm: Math.round(bpm) });
  }
  if (out.length === 0) return null;
  out.sort((a, b) => a.t.localeCompare(b.t));
  // Keep payloads small: at most ~600 points per workout.
  const step = Math.ceil(out.length / 600);
  return step > 1 ? out.filter((_, i) => i % step === 0) : out;
}

function parseWorkouts(list: unknown[]): WorkoutPoint[] {
  const out: WorkoutPoint[] = [];
  for (const w of list) {
    if (!isObj(w)) continue;
    const startAt = parseDate(w.start ?? w.startDate ?? w.start_at);
    const endAt = parseDate(w.end ?? w.endDate ?? w.end_at);
    if (!startAt || !endAt) continue;
    const activityType = String(w.name ?? w.type ?? w.activityType ?? "Workout");
    const hrSamples = parseHrSamples(w.heartRateData ?? w.heartRateSamples ?? (Array.isArray(w.heartRate) ? w.heartRate : null));
    const hr = isObj(w.heartRate) ? w.heartRate : {};
    const bpms = hrSamples?.map((s) => s.bpm) ?? [];
    const avgHr = num(w.avgHeartRate) ?? num(w.avgHr) ?? num(hr.avg) ?? (bpms.length ? bpms.reduce((a, b) => a + b, 0) / bpms.length : null);
    const maxHr = num(w.maxHeartRate) ?? num(w.maxHr) ?? num(hr.max) ?? (bpms.length ? Math.max(...bpms) : null);
    const minHr = num(w.minHeartRate) ?? num(w.minHr) ?? num(hr.min) ?? (bpms.length ? Math.min(...bpms) : null);
    const duration = num(w.duration);
    out.push({
      externalId: String(w.id ?? w.uuid ?? `${activityType}-${startAt.toISOString()}`),
      activityType,
      startAt,
      endAt,
      durationSec: duration != null ? Math.round(duration) : Math.round((endAt.getTime() - startAt.getTime()) / 1000),
      activeKcal: toKcal(w.activeEnergyBurned ?? w.activeEnergy ?? w.activeKcal),
      totalKcal: toKcal(w.totalEnergy ?? w.totalEnergyBurned ?? w.totalKcal),
      avgHr,
      maxHr,
      minHr,
      distanceM: toMeters(w.distance),
      hrSamples,
    });
  }
  return out;
}

// ───────────────────────── Ingest ─────────────────────────

/**
 * Accepts the "Health Auto Export" REST payload ({ data: { metrics, workouts } })
 * as well as a flat { metrics: [...], workouts: [...] } body (iOS Shortcuts).
 */
export async function ingestHealth(userId: string, body: unknown, source = "apple_health") {
  const root = isObj(body) && isObj(body.data) ? body.data : isObj(body) ? body : {};
  const metrics = parseMetrics(Array.isArray(root.metrics) ? root.metrics : []);
  const workoutPoints = parseWorkouts(Array.isArray(root.workouts) ? root.workouts : []);

  for (let i = 0; i < metrics.length; i += 500) {
    await db
      .insert(healthMetrics)
      .values(
        metrics.slice(i, i + 500).map((m) => ({
          userId,
          metric: m.metric,
          day: m.day,
          value: m.value,
          unit: METRIC_INFO[m.metric]?.unit ?? null,
          source,
        })),
      )
      .onConflictDoUpdate({
        target: [healthMetrics.userId, healthMetrics.metric, healthMetrics.day],
        set: { value: sql`excluded.value`, source: sql`excluded.source`, updatedAt: new Date() },
      });
  }

  for (const w of workoutPoints) {
    await db
      .insert(healthWorkouts)
      .values({ userId, ...w })
      .onConflictDoUpdate({
        target: [healthWorkouts.userId, healthWorkouts.externalId],
        set: {
          activityType: w.activityType,
          startAt: w.startAt,
          endAt: w.endAt,
          durationSec: w.durationSec,
          activeKcal: w.activeKcal,
          totalKcal: w.totalKcal,
          avgHr: w.avgHr,
          maxHr: w.maxHr,
          minHr: w.minHr,
          distanceM: w.distanceM,
          ...(w.hrSamples ? { hrSamples: w.hrSamples } : {}),
        },
      });
  }

  const linked = await linkHealthWorkouts(userId);
  return { metrics: metrics.length, workouts: workoutPoints.length, linked };
}

/**
 * Attaches Apple Watch workouts to gym sessions whose time ranges overlap.
 * Returns the number of newly linked watch workouts.
 */
export async function linkHealthWorkouts(userId: string) {
  const unlinked = await db
    .select({ id: healthWorkouts.id, startAt: healthWorkouts.startAt, endAt: healthWorkouts.endAt })
    .from(healthWorkouts)
    .where(and(eq(healthWorkouts.userId, userId), isNull(healthWorkouts.workoutId)))
    .orderBy(desc(healthWorkouts.startAt))
    .limit(200);
  if (unlinked.length === 0) return 0;

  const sessions = await db
    .select({ id: workouts.id, startedAt: workouts.startedAt, endedAt: workouts.endedAt })
    .from(workouts)
    .where(and(eq(workouts.userId, userId), inArray(workouts.status, ["completed", "in_progress"])));

  let linked = 0;
  for (const h of unlinked) {
    let best: { id: string; overlap: number } | null = null;
    for (const s of sessions) {
      if (!s.startedAt) continue;
      const sStart = s.startedAt.getTime();
      const sEnd = (s.endedAt ?? new Date()).getTime();
      const overlap = Math.min(sEnd, h.endAt.getTime()) - Math.max(sStart, h.startAt.getTime());
      if (overlap > (best?.overlap ?? 0)) best = { id: s.id, overlap };
    }
    // Require at least 3 minutes in common to avoid accidental matches.
    if (best && best.overlap >= 3 * 60 * 1000) {
      await db.update(healthWorkouts).set({ workoutId: best.id }).where(eq(healthWorkouts.id, h.id));
      linked++;
    }
  }
  return linked;
}

export async function setHealthWorkoutLink(userId: string, healthWorkoutId: string, workoutId: string | null) {
  if (workoutId) {
    const [w] = await db
      .select({ id: workouts.id })
      .from(workouts)
      .where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)));
    if (!w) return;
  }
  await db
    .update(healthWorkouts)
    .set({ workoutId })
    .where(and(eq(healthWorkouts.id, healthWorkoutId), eq(healthWorkouts.userId, userId)));
}

// ───────────────────────── Read ─────────────────────────

export async function upsertMetric(userId: string, metric: string, day: string, value: number, source = "manual") {
  await db
    .insert(healthMetrics)
    .values({ userId, metric, day, value, unit: METRIC_INFO[metric]?.unit ?? null, source })
    .onConflictDoUpdate({
      target: [healthMetrics.userId, healthMetrics.metric, healthMetrics.day],
      set: { value, source, updatedAt: new Date() },
    });
}

export async function deleteMetric(userId: string, metric: string, day: string) {
  await db
    .delete(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), eq(healthMetrics.metric, metric), eq(healthMetrics.day, day)));
}

export async function getMetricSeries(userId: string, metricNames: string[], from?: string, to?: string) {
  if (metricNames.length === 0) return [];
  const where = [eq(healthMetrics.userId, userId), inArray(healthMetrics.metric, metricNames)];
  if (from) where.push(gte(healthMetrics.day, from));
  if (to) where.push(lte(healthMetrics.day, to));
  return db
    .select({ metric: healthMetrics.metric, day: healthMetrics.day, value: healthMetrics.value, source: healthMetrics.source })
    .from(healthMetrics)
    .where(and(...where))
    .orderBy(asc(healthMetrics.day));
}

export async function listAvailableMetrics(userId: string) {
  return db
    .select({
      metric: healthMetrics.metric,
      count: sql<number>`count(*)::int`,
      lastDay: sql<string>`max(${healthMetrics.day})`,
    })
    .from(healthMetrics)
    .where(eq(healthMetrics.userId, userId))
    .groupBy(healthMetrics.metric);
}

export async function listHealthWorkouts(userId: string, opts: { from?: string; to?: string; limit?: number; unlinkedOnly?: boolean } = {}) {
  const where = [eq(healthWorkouts.userId, userId)];
  if (opts.from) where.push(gte(healthWorkouts.startAt, new Date(`${opts.from}T00:00:00Z`)));
  if (opts.to) where.push(lte(healthWorkouts.startAt, new Date(`${opts.to}T23:59:59Z`)));
  if (opts.unlinkedOnly) where.push(isNull(healthWorkouts.workoutId));
  return db
    .select({
      id: healthWorkouts.id,
      activityType: healthWorkouts.activityType,
      startAt: healthWorkouts.startAt,
      endAt: healthWorkouts.endAt,
      durationSec: healthWorkouts.durationSec,
      activeKcal: healthWorkouts.activeKcal,
      avgHr: healthWorkouts.avgHr,
      maxHr: healthWorkouts.maxHr,
      distanceM: healthWorkouts.distanceM,
      workoutId: healthWorkouts.workoutId,
    })
    .from(healthWorkouts)
    .where(and(...where))
    .orderBy(desc(healthWorkouts.startAt))
    .limit(opts.limit ?? 50);
}
