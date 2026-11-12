import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { sets, workoutExercises, workouts } from "@/db/schema";
import { getMetricSeries } from "./health";
import { goalFraction, type Goal, type Profile } from "./profile";

export type GoalProgress = { current: number | null; unit: string; fraction: number | null };

/** Current value behind each measurable goal: latest body weight or measurement, or the heaviest finished set of the exercise. */
export async function currentGoalValues(userId: string, goals: Goal[]): Promise<Map<string, number | null>> {
  const tracked = goals.filter((g) => g.metric);
  const metricKeys = [...new Set(tracked.flatMap((g) => (g.metric!.kind === "body_mass" ? ["body_mass"] : g.metric!.kind === "measure" ? [g.metric!.key] : [])))];
  const exerciseIds = [...new Set(tracked.flatMap((g) => (g.metric!.kind === "exercise" ? [g.metric!.exerciseId] : [])))];
  const [series, best] = await Promise.all([
    metricKeys.length ? getMetricSeries(userId, metricKeys) : [],
    exerciseIds.length
      ? db
          .select({ exerciseId: workoutExercises.exerciseId, weight: sql<number>`max(${sets.weight})::float` })
          .from(sets)
          .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
          .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
          .where(and(eq(workouts.userId, userId), eq(workouts.status, "completed"), eq(sets.completed, true), inArray(workoutExercises.exerciseId, exerciseIds)))
          .groupBy(workoutExercises.exerciseId)
      : [],
  ]);
  const latest = (key: string) => series.filter((s) => s.metric === key).at(-1)?.value ?? null;
  return new Map(
    tracked.map((g) => {
      const m = g.metric!;
      const value = m.kind === "body_mass" ? latest("body_mass") : m.kind === "measure" ? latest(m.key) : (best.find((b) => b.exerciseId === m.exerciseId)?.weight ?? null);
      return [g.id, value];
    }),
  );
}

/** Progress of every measurable goal, keyed by goal id. */
export async function goalProgress(userId: string, profile: Profile): Promise<Record<string, GoalProgress>> {
  const values = await currentGoalValues(userId, profile.goals);
  return Object.fromEntries(
    profile.goals
      .filter((g) => g.metric)
      .map((g) => {
        const current = values.get(g.id) ?? null;
        return [g.id, { current, unit: g.metric!.kind === "measure" ? "см" : "кг", fraction: goalFraction(g.start, current, g.target) }];
      }),
  );
}
