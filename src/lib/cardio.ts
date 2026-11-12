import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, like, lte } from "drizzle-orm";
import { db } from "@/db";
import { healthWorkouts } from "@/db/schema";
import { addDays, dayOf, weekStart } from "./format";
import { CARDIO_LABEL, cardioKind, type CardioKind } from "./cardio-kinds";

export type CardioSession = {
  id: string;
  kind: CardioKind;
  activityType: string;
  startAt: Date;
  endAt: Date;
  durationSec: number;
  distanceM: number | null;
  activeKcal: number | null;
  avgHr: number | null;
  maxHr: number | null;
  manual: boolean;
  workoutId: string | null;
};

const MANUAL = "manual:";

/** Runs, rides and other cardio — recorded by Apple Watch or added by hand. */
export async function listCardio(userId: string, opts: { from?: string; to?: string; limit?: number } = {}): Promise<CardioSession[]> {
  const where = [eq(healthWorkouts.userId, userId)];
  if (opts.from) where.push(gte(healthWorkouts.startAt, new Date(`${opts.from}T00:00:00Z`)));
  if (opts.to) where.push(lte(healthWorkouts.startAt, new Date(`${opts.to}T23:59:59Z`)));
  const rows = await db
    .select({
      id: healthWorkouts.id,
      externalId: healthWorkouts.externalId,
      activityType: healthWorkouts.activityType,
      startAt: healthWorkouts.startAt,
      endAt: healthWorkouts.endAt,
      durationSec: healthWorkouts.durationSec,
      distanceM: healthWorkouts.distanceM,
      activeKcal: healthWorkouts.activeKcal,
      avgHr: healthWorkouts.avgHr,
      maxHr: healthWorkouts.maxHr,
      workoutId: healthWorkouts.workoutId,
    })
    .from(healthWorkouts)
    .where(and(...where))
    .orderBy(desc(healthWorkouts.startAt))
    .limit(opts.limit ?? 2000);
  const out: CardioSession[] = [];
  for (const r of rows) {
    const kind = cardioKind(r.activityType);
    if (!kind) continue;
    out.push({
      id: r.id,
      kind,
      activityType: r.activityType,
      startAt: r.startAt,
      endAt: r.endAt,
      durationSec: r.durationSec ?? Math.round((r.endAt.getTime() - r.startAt.getTime()) / 1000),
      distanceM: r.distanceM,
      activeKcal: r.activeKcal,
      avgHr: r.avgHr,
      maxHr: r.maxHr,
      manual: r.externalId.startsWith(MANUAL),
      workoutId: r.workoutId,
    });
  }
  return out;
}

export async function getCardioSession(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(healthWorkouts)
    .where(and(eq(healthWorkouts.id, id), eq(healthWorkouts.userId, userId)));
  if (!row) return null;
  const kind = cardioKind(row.activityType);
  return kind ? { ...row, kind, manual: row.externalId.startsWith(MANUAL) } : null;
}

export async function addManualCardio(
  userId: string,
  input: { kind: "run" | "cycle"; startAt: Date; durationSec: number; distanceM: number | null; avgHr?: number | null; activeKcal?: number | null },
) {
  const [row] = await db
    .insert(healthWorkouts)
    .values({
      userId,
      externalId: `${MANUAL}${randomUUID()}`,
      activityType: CARDIO_LABEL[input.kind],
      startAt: input.startAt,
      endAt: new Date(input.startAt.getTime() + input.durationSec * 1000),
      durationSec: input.durationSec,
      distanceM: input.distanceM,
      avgHr: input.avgHr ?? null,
      activeKcal: input.activeKcal ?? null,
    })
    .returning({ id: healthWorkouts.id });
  return row.id;
}

/** Only hand-entered sessions can be deleted; watch data is managed by the watch. */
export async function deleteManualCardio(userId: string, id: string) {
  await db
    .delete(healthWorkouts)
    .where(and(eq(healthWorkouts.id, id), eq(healthWorkouts.userId, userId), like(healthWorkouts.externalId, `${MANUAL}%`)));
}

export type CardioWeek = { week: string; runKm: number; cycleKm: number; walkKm: number; minutes: number; sessions: number };

export async function getCardioAnalytics(userId: string, weeks = 12) {
  const today = dayOf();
  const from = addDays(weekStart(today), -(weeks - 1) * 7);
  const sessions = await listCardio(userId, { from: addDays(from, -1) });
  const weekly = new Map<string, CardioWeek>();
  for (let i = 0; i < weeks; i++) {
    const week = addDays(from, i * 7);
    weekly.set(week, { week, runKm: 0, cycleKm: 0, walkKm: 0, minutes: 0, sessions: 0 });
  }
  const inRange = sessions.filter((s) => weekly.has(weekStart(dayOf(s.startAt))));
  for (const s of inRange) {
    const w = weekly.get(weekStart(dayOf(s.startAt)))!;
    const km = (s.distanceM ?? 0) / 1000;
    if (s.kind === "run") w.runKm += km;
    else if (s.kind === "cycle") w.cycleKm += km;
    else if (s.kind === "walk") w.walkKm += km;
    w.minutes += s.durationSec / 60;
    w.sessions++;
  }
  const total = (kind: CardioKind) => {
    const list = inRange.filter((s) => s.kind === kind);
    const distanceM = list.reduce((a, s) => a + (s.distanceM ?? 0), 0);
    const durationSec = list.reduce((a, s) => a + s.durationSec, 0);
    const paced = list.filter((s) => s.distanceM && s.distanceM > 50);
    return {
      kind,
      sessions: list.length,
      distanceM,
      durationSec,
      pacedDistanceM: paced.reduce((a, s) => a + (s.distanceM ?? 0), 0),
      pacedDurationSec: paced.reduce((a, s) => a + s.durationSec, 0),
    };
  };
  return {
    from,
    to: today,
    weekly: [...weekly.values()],
    sessions: inRange,
    totals: { run: total("run"), cycle: total("cycle"), walk: total("walk"), other: total("other") },
  };
}
