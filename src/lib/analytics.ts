import "server-only";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { exercises, sets, workoutExercises, workouts, type MuscleGroup } from "@/db/schema";
import { BODY_MUSCLES, muscleStatus, type MuscleBalance } from "./muscles";
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
      .select({ id: workouts.id, startedAt: workouts.startedAt, endedAt: workouts.endedAt })
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
    if (s.endedAt) w.durationMin += Math.round((s.endedAt.getTime() - s.startedAt.getTime()) / 60000);
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

/**
 * Per-muscle training load, week by week. A working set counts 1 for the exercise's
 * primary muscle and 0.5 for each secondary one; warm-up sets are ignored.
 */
export async function getMuscleBalance(userId: string, weeks = 12): Promise<MuscleBalance> {
  const today = dayOf();
  const thisWeek = weekStart(today);
  const from = addDays(thisWeek, -(weeks - 1) * 7);
  const weekList = Array.from({ length: weeks }, (_, i) => addDays(from, i * 7));

  const [rows, library] = await Promise.all([
    completedSetRows(userId),
    db
      .select({ id: exercises.id, name: exercises.name, nameUk: exercises.nameUk, muscle: exercises.muscle, userId: exercises.userId })
      .from(exercises)
      .where(eq(exercises.archived, false)),
  ]);

  const lastTrained: Partial<Record<MuscleGroup, string>> = {};
  const usage = new Map<string, number>(); // exerciseId → sets ever done
  const contrib = new Map<string, { week: string; muscle: MuscleGroup; exerciseId: string; name: string; sets: number }>();

  for (const r of rows) {
    if (!r.startedAt || r.type === "warmup") continue;
    const day = dayOf(r.startedAt);
    const week = weekStart(day);
    usage.set(r.exerciseId, (usage.get(r.exerciseId) ?? 0) + 1);
    const hits: [MuscleGroup, number][] = [[r.muscle, 1], ...r.secondaryMuscles.map((m): [MuscleGroup, number] => [m, 0.5])];
    for (const [muscle, weight] of hits) {
      if (!BODY_MUSCLES.includes(muscle)) continue;
      if (!lastTrained[muscle] || lastTrained[muscle]! < day) lastTrained[muscle] = day;
      if (week < from) continue;
      const key = `${week}|${muscle}|${r.exerciseId}`;
      const c = contrib.get(key) ?? { week, muscle, exerciseId: r.exerciseId, name: r.exerciseName, sets: 0 };
      c.sets += weight;
      contrib.set(key, c);
    }
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
    lastTrained,
    suggestions,
  };
}

/** Compact per-muscle summary (for Claude): sets this week, weekly average, status, last trained. */
export async function getMuscleSummary(userId: string, weeks = 8) {
  const b = await getMuscleBalance(userId, weeks);
  const current = b.weeks.at(-1)!;
  return {
    counting: "1 set for the primary muscle, 0.5 for each secondary; warm-ups excluded. Guideline: 10–20 sets per muscle per week.",
    weeks: b.weeks,
    muscles: BODY_MUSCLES.map((m) => {
      const perWeek = b.weeks.map((w) => b.contributions.filter((c) => c.week === w && c.muscle === m).reduce((a, c) => a + c.sets, 0));
      const avg = perWeek.reduce((a, x) => a + x, 0) / perWeek.length;
      return {
        muscle: m,
        sets_this_week: perWeek.at(-1) ?? 0,
        avg_sets_per_week: Math.round(avg * 10) / 10,
        status_this_week: muscleStatus(perWeek.at(-1) ?? 0),
        status_average: muscleStatus(avg),
        sets_by_week: perWeek,
        last_trained: b.lastTrained[m] ?? null,
        top_exercises_this_week: b.contributions
          .filter((c) => c.week === current && c.muscle === m)
          .sort((a, c) => c.sets - a.sets)
          .slice(0, 4)
          .map((c) => ({ exercise: c.name, sets: c.sets })),
      };
    }),
  };
}
