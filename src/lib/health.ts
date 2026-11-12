import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { healthMetrics, healthWorkouts, workouts } from "@/db/schema";
import { parseHealthPayload } from "./health-parse";
import { METRIC_INFO } from "./labels";

// ───────────────────────── Ingest ─────────────────────────

/**
 * Accepts the "Health Auto Export" REST payload ({ data: { metrics, workouts } })
 * as well as a flat { metrics: [...], workouts: [...] } body (iOS Shortcuts).
 */
export async function ingestHealth(userId: string, body: unknown, source = "apple_health") {
  const { metrics, workouts: workoutPoints } = parseHealthPayload(body);

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
