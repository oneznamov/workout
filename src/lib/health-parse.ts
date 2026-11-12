import type { HrSample } from "@/db/schema";
import { dayOf } from "./format";
import { METRIC_INFO } from "./labels";

/**
 * Pure parsing of Apple Health payloads (the "Health Auto Export" REST format and a
 * flat variant for iOS Shortcuts). No database access — see health.ts for storing.
 */

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
  // Health Auto Export v2 may send a per-minute series instead of a single total.
  if (Array.isArray(v)) {
    const parts = v.map(toKcal).filter((x): x is number => x != null);
    return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
  }
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

export type MetricPoint = { metric: string; day: string; value: number };
export type WorkoutPoint = {
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
        const stages = [num(p.core), num(p.rem), num(p.deep)].filter((x): x is number => x != null);
        value =
          num(p.totalSleep) ??
          num(p.asleep) ??
          (stages.length ? stages.reduce((a, b) => a + b, 0) : null) ??
          num(p.qty) ??
          num(p.value);
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
  // Keep payloads small but fine enough to see single sets: at most ~1500 points per workout.
  const step = Math.ceil(out.length / 1500);
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
      activeKcal: toKcal(w.activeEnergyBurned) ?? toKcal(w.activeEnergy) ?? toKcal(w.activeKcal),
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

/** Splits a request body into day-level metrics and watch workouts. */
export function parseHealthPayload(body: unknown) {
  const root = isObj(body) && isObj(body.data) ? body.data : isObj(body) ? body : {};
  return {
    metrics: parseMetrics(Array.isArray(root.metrics) ? root.metrics : []),
    workouts: parseWorkouts(Array.isArray(root.workouts) ? root.workouts : []),
  };
}
