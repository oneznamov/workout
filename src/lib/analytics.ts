import "server-only";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { exercises, sets, workoutExercises, workouts, type MuscleGroup } from "@/db/schema";
import { listCardio } from "./cardio";
import { CARDIO_LABEL, CARDIO_MUSCLES, hrIntensity } from "./cardio-kinds";
import { BODY_MUSCLES, CARDIO_MINUTES_PER_POINT, muscleStatus, type CardioLoad, type MuscleBalance, type MuscleContribution } from "./muscles";
import { addDays, dayOf, e1rm, weekStart } from "./format";

/** Every completed set of every finished workout in the range, flattened. */
async function completedSetRows(userId: string, from?: string, to?: string, exerciseId?: string) {
  const where = [eq(workouts.userId, userId), eq(workouts.status, "completed"), eq(sets.completed, true)];
  if (from) where.push(gte(workouts.startedAt, new Date(`${from}T00:00:00Z`)));
  if (to) where.push(lte(workouts.startedAt, new Date(`${to}T23:59:59Z`)));
  if (exerciseId) where.push(eq(workoutExercises.exerciseId, exerciseId));
  return db
    .select({
      workoutId: workouts.id,
      workoutName: workouts.name,
      startedAt: workouts.startedAt,
      endedAt: workouts.endedAt,
      exerciseId: exercises.id,
      exerciseName: exercises.name,
      muscle: exercises.muscle,
      secondaryMuscles: exercises.secondaryMuscles,
      tracking: exercises.tracking,
      type: sets.type,
      weight: sets.weight,
      reps: sets.reps,
      durationSec: sets.durationSec,
      distanceM: sets.distanceM,
    })
    .from(sets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(and(...where))
    .orderBy(asc(workouts.startedAt), asc(workoutExercises.position), asc(sets.position));
}

export type WeekStat = { week: string; workouts: number; durationMin: number; volume: number; sets: number };

export async function getTrainingAnalytics(userId: string, weeks = 12) {
  const today = dayOf();
  const from = addDays(weekStart(today), -(weeks - 1) * 7);

  const [rows, sessions] = await Promise.all([
    completedSetRows(userId, from),
    db
      .select({ id: workouts.id, startedAt: workouts.startedAt, endedAt: workouts.endedAt, pausedSec: workouts.pausedSec })
      .from(workouts)
      .where(
        and(
          eq(workouts.userId, userId),
          eq(workouts.status, "completed"),
          gte(workouts.startedAt, new Date(`${from}T00:00:00Z`)),
        ),
      ),
  ]);

  const weekly = new Map<string, WeekStat>();
  for (let i = 0; i < weeks; i++) {
    const week = addDays(from, i * 7);
    weekly.set(week, { week, workouts: 0, durationMin: 0, volume: 0, sets: 0 });
  }
  for (const s of sessions) {
    if (!s.startedAt) continue;
    const w = weekly.get(weekStart(dayOf(s.startedAt)));
    if (!w) continue;
    w.workouts++;
    if (s.endedAt) w.durationMin += Math.max(0, Math.round((s.endedAt.getTime() - s.startedAt.getTime()) / 60000 - s.pausedSec / 60));
  }

  const muscleSets = new Map<MuscleGroup, number>();
  const exerciseStats = new Map<
    string,
    { exerciseId: string; name: string; muscle: MuscleGroup; sets: number; volume: number; bestE1rm: number; maxWeight: number; sessions: Set<string> }
  >();

  for (const r of rows) {
    if (!r.startedAt) continue;
    const vol = (r.weight ?? 0) * (r.reps ?? 0);
    const w = weekly.get(weekStart(dayOf(r.startedAt)));
    if (w) {
      w.sets++;
      w.volume += vol;
    }
    if (r.type !== "warmup") muscleSets.set(r.muscle, (muscleSets.get(r.muscle) ?? 0) + 1);
    const es =
      exerciseStats.get(r.exerciseId) ??
      { exerciseId: r.exerciseId, name: r.exerciseName, muscle: r.muscle, sets: 0, volume: 0, bestE1rm: 0, maxWeight: 0, sessions: new Set<string>() };
    es.sets++;
    es.volume += vol;
    es.sessions.add(r.workoutId);
    if (r.weight && r.reps) {
      es.bestE1rm = Math.max(es.bestE1rm, e1rm(r.weight, r.reps));
      es.maxWeight = Math.max(es.maxWeight, r.weight);
    }
    exerciseStats.set(r.exerciseId, es);
  }

  return {
    from,
    to: today,
    weekly: [...weekly.values()],
    muscles: [...muscleSets.entries()].map(([muscle, count]) => ({ muscle, sets: count })).sort((a, b) => b.sets - a.sets),
    exercises: [...exerciseStats.values()]
      .map(({ sessions: s, ...e }) => ({ ...e, sessions: s.size, bestE1rm: Math.round(e.bestE1rm * 10) / 10 }))
      .sort((a, b) => b.sets - a.sets),
    totals: {
      workouts: sessions.length,
      sets: rows.length,
      volume: rows.reduce((a, r) => a + (r.weight ?? 0) * (r.reps ?? 0), 0),
      durationMin: [...weekly.values()].reduce((a, w) => a + w.durationMin, 0),
    },
  };
}

export type ExerciseSession = {
  workoutId: string;
  workoutName: string;
  date: string;
  sets: { weight: number | null; reps: number | null; durationSec: number | null; distanceM: number | null; type: string }[];
  volume: number;
  topWeight: number;
  bestE1rm: number;
  totalReps: number;
};

/** Per-session history of a single exercise (oldest → newest). */
export async function getExerciseHistory(userId: string, exerciseId: string, limit = 60): Promise<ExerciseSession[]> {
  const rows = await completedSetRows(userId, undefined, undefined, exerciseId);
  const byWorkout = new Map<string, ExerciseSession>();
  for (const r of rows) {
    if (!r.startedAt) continue;
    const s =
      byWorkout.get(r.workoutId) ??
      { workoutId: r.workoutId, workoutName: r.workoutName, date: r.startedAt.toISOString(), sets: [], volume: 0, topWeight: 0, bestE1rm: 0, totalReps: 0 };
    s.sets.push({ weight: r.weight, reps: r.reps, durationSec: r.durationSec, distanceM: r.distanceM, type: r.type });
    s.volume += (r.weight ?? 0) * (r.reps ?? 0);
    s.totalReps += r.reps ?? 0;
    if (r.weight != null) s.topWeight = Math.max(s.topWeight, r.weight);
    if (r.weight && r.reps) s.bestE1rm = Math.max(s.bestE1rm, Math.round(e1rm(r.weight, r.reps) * 10) / 10);
    byWorkout.set(r.workoutId, s);
  }
  return [...byWorkout.values()].slice(-limit);
}

/** Compact dashboard numbers for the current week. */
export async function getWeekSummary(userId: string) {
  const a = await getTrainingAnalytics(userId, 2);
  const [prev, cur] = a.weekly;
  return { cur, prev };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** 1 for a set at your best, sliding down to 0.25 for something at half of it. */
const effort = (ratio: number) => clamp(0.25 + (ratio - 0.5) * 1.5, 0.25, 1);

/**
 * Per-muscle training load, week by week, in "load points".
 *
 * A hard working set is 1 point for the exercise's primary muscle and 0.5 for each
 * secondary one. Easier sets count for less (scaled by how close the set is to your best
 * for that exercise), warm-ups count for nothing. Cardio adds about 1 point per 10 minutes
 * to the muscles it works, scaled by heart-rate intensity.
 */
export async function getMuscleBalance(userId: string, weeks = 12): Promise<MuscleBalance> {
  const today = dayOf();
  const thisWeek = weekStart(today);
  const from = addDays(thisWeek, -(weeks - 1) * 7);
  const weekList = Array.from({ length: weeks }, (_, i) => addDays(from, i * 7));

  const [rows, library, cardioSessions] = await Promise.all([
    completedSetRows(userId),
    db
      .select({ id: exercises.id, name: exercises.name, nameUk: exercises.nameUk, muscle: exercises.muscle, userId: exercises.userId })
      .from(exercises)
      .where(eq(exercises.archived, false)),
    listCardio(userId),
  ]);

  // Personal bests per exercise — the yardstick for how hard a set was.
  const best = new Map<string, { e1rm: number; reps: number; dur: number }>();
  for (const r of rows) {
    if (r.type === "warmup") continue;
    const b = best.get(r.exerciseId) ?? { e1rm: 0, reps: 0, dur: 0 };
    if (r.weight && r.reps) b.e1rm = Math.max(b.e1rm, e1rm(r.weight, r.reps));
    if (r.reps) b.reps = Math.max(b.reps, r.reps);
    if (r.durationSec) b.dur = Math.max(b.dur, r.durationSec);
    best.set(r.exerciseId, b);
  }
  const hrRef = Math.max(0, ...cardioSessions.map((c) => c.maxHr ?? 0)) || 190;
  // Gym workouts whose cardio part was recorded by the watch — counted from the watch, not twice.
  const watchedCardio = new Set(cardioSessions.map((c) => c.workoutId).filter(Boolean));

  const lastTrained: Partial<Record<MuscleGroup, string>> = {};
  const usage = new Map<string, number>();
  const contrib = new Map<string, MuscleContribution>();
  const cardio = new Map<string, CardioLoad>();

  const add = (day: string, muscle: MuscleGroup, exerciseId: string, name: string, points: number, isCardio = false) => {
    if (!BODY_MUSCLES.includes(muscle) || points <= 0) return;
    if (!lastTrained[muscle] || lastTrained[muscle]! < day) lastTrained[muscle] = day;
    const week = weekStart(day);
    if (week < from) return;
    const key = `${week}|${muscle}|${exerciseId}`;
    const c = contrib.get(key) ?? { week, muscle, exerciseId, name, sets: 0, cardio: isCardio };
    c.sets += points;
    contrib.set(key, c);
  };
  const addCardio = (day: string, label: string, minutes: number, intensity: number) => {
    const week = weekStart(day);
    if (week < from || minutes <= 0) return;
    const c = cardio.get(`${week}|${label}`) ?? { week, label, minutes: 0, load: 0 };
    c.minutes += minutes;
    c.load += (minutes * intensity) / CARDIO_MINUTES_PER_POINT;
    cardio.set(`${week}|${label}`, c);
  };

  for (const r of rows) {
    if (!r.startedAt || r.type === "warmup") continue;
    const day = dayOf(r.startedAt);
    usage.set(r.exerciseId, (usage.get(r.exerciseId) ?? 0) + 1);

    if (r.muscle === "cardio") {
      if (watchedCardio.has(r.workoutId)) continue;
      const minutes = r.durationSec ? r.durationSec / 60 : r.distanceM ? (r.distanceM / 1000) * 6 : 0;
      for (const m of r.secondaryMuscles) add(day, m, r.exerciseId, r.exerciseName, (minutes / 10) * 0.7, true);
      addCardio(day, r.exerciseName, minutes, 1);
      continue;
    }

    const b = best.get(r.exerciseId);
    let f = 1;
    if (r.weight && r.reps && b?.e1rm) f = effort(e1rm(r.weight, r.reps) / b.e1rm);
    else if (r.tracking === "duration" && r.durationSec && b?.dur) f = effort(r.durationSec / b.dur);
    else if (!r.weight && r.reps && b?.reps) f = effort(r.reps / b.reps);
    if (r.type === "failure") f = Math.min(1.15, f * 1.15);
    if (r.type === "drop") f *= 0.7;

    add(day, r.muscle, r.exerciseId, r.exerciseName, f);
    for (const m of r.secondaryMuscles) add(day, m, r.exerciseId, r.exerciseName, f * 0.5);
  }

  for (const c of cardioSessions) {
    const day = dayOf(c.startAt);
    const minutes = c.durationSec / 60;
    const intensity = hrIntensity(c.avgHr, hrRef);
    for (const [m, w] of Object.entries(CARDIO_MUSCLES[c.kind]) as [MuscleGroup, number][]) {
      add(day, m, `cardio:${c.kind}`, CARDIO_LABEL[c.kind], (minutes / 10) * w * intensity, true);
    }
    addCardio(day, CARDIO_LABEL[c.kind], minutes, intensity * (c.kind === "walk" ? 0.5 : 1));
  }

  const suggestions = Object.fromEntries(
    BODY_MUSCLES.map((m) => [
      m,
      library
        .filter((e) => e.muscle === m && (e.userId === null || e.userId === userId))
        .map((e) => ({ id: e.id, name: e.name, nameUk: e.nameUk, done: usage.get(e.id) ?? 0 }))
        .sort((a, b) => b.done - a.done)
        .slice(0, 6),
    ]),
  ) as MuscleBalance["suggestions"];

  return {
    weeks: weekList,
    today,
    contributions: [...contrib.values()],
    cardio: [...cardio.values()],
    lastTrained,
    suggestions,
  };
}

/** Compact per-muscle summary (for Claude): load this week, weekly average, status, last trained. */
export async function getMuscleSummary(userId: string, weeks = 8) {
  const b = await getMuscleBalance(userId, weeks);
  const current = b.weeks.at(-1)!;
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    counting:
      "Load points: a hard working set = 1 for the primary muscle, 0.5 for each secondary; easier sets count for less (relative to the personal best of that exercise), warm-ups for nothing. Cardio adds ~1 point per 10 min to the muscles it works, scaled by heart-rate intensity. Guideline: 10–20 points per muscle per week.",
    weeks: b.weeks,
    muscles: BODY_MUSCLES.map((m) => {
      const perWeek = b.weeks.map((w) => b.contributions.filter((c) => c.week === w && c.muscle === m).reduce((a, c) => a + c.sets, 0));
      const avg = perWeek.reduce((a, x) => a + x, 0) / perWeek.length;
      return {
        muscle: m,
        load_this_week: round(perWeek.at(-1) ?? 0),
        avg_load_per_week: round(avg),
        status_this_week: muscleStatus(perWeek.at(-1) ?? 0),
        status_average: muscleStatus(avg),
        load_by_week: perWeek.map(round),
        last_trained: b.lastTrained[m] ?? null,
        top_sources_this_week: b.contributions
          .filter((c) => c.week === current && c.muscle === m)
          .sort((a, c) => c.sets - a.sets)
          .slice(0, 4)
          .map((c) => ({ source: c.name, load: round(c.sets), cardio: c.cardio ?? false })),
      };
    }),
    cardio_minutes_by_week: b.weeks.map((w) => Math.round(b.cardio.filter((c) => c.week === w).reduce((a, c) => a + c.minutes, 0))),
  };
}

export type RecordRow = {
  exerciseId: string;
  name: string;
  weight: number;
  reps: number;
  e1rm: number;
  day: string;
  /** Best estimated 1RM before the period started (null if the exercise is new). */
  before: number | null;
  isNew: boolean;
};

/** Personal records by estimated 1RM; `isNew` marks the ones set on or after `since`. */
export async function getRecords(userId: string, since: string, limit = 12): Promise<RecordRow[]> {
  const rows = await completedSetRows(userId);
  const best = new Map<string, RecordRow>();
  for (const r of rows) {
    if (!r.startedAt || !r.weight || !r.reps || r.type === "warmup") continue;
    const day = dayOf(r.startedAt);
    const value = Math.round(e1rm(r.weight, r.reps) * 10) / 10;
    const cur = best.get(r.exerciseId);
    if (!cur) {
      best.set(r.exerciseId, { exerciseId: r.exerciseId, name: r.exerciseName, weight: r.weight, reps: r.reps, e1rm: value, day, before: day < since ? value : null, isNew: day >= since });
      continue;
    }
    if (day < since) cur.before = Math.max(cur.before ?? 0, value);
    if (value > cur.e1rm) Object.assign(cur, { weight: r.weight, reps: r.reps, e1rm: value, day, isNew: day >= since });
  }
  return [...best.values()]
    .sort((a, b) => Number(b.isNew) - Number(a.isNew) || b.day.localeCompare(a.day) || b.e1rm - a.e1rm)
    .slice(0, limit);
}
