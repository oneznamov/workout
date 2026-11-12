import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { exercises, healthMetrics, healthWorkouts, sets, users, workoutExercises, workouts } from "@/db/schema";

function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const copy = { ...obj };
  for (const k of keys) delete copy[k];
  return copy;
}

/** Everything the account owns, in one portable object. */
export async function exportAccount(userId: string) {
  const [[user], allWorkouts, custom, metrics, watch] = await Promise.all([
    db.select({ username: users.username, goals: users.goals, createdAt: users.createdAt }).from(users).where(eq(users.id, userId)),
    db.query.workouts.findMany({
      where: eq(workouts.userId, userId),
      orderBy: [asc(workouts.createdAt)],
      with: {
        exercises: {
          orderBy: [asc(workoutExercises.position)],
          with: { exercise: { columns: { name: true, nameUk: true, muscle: true, equipment: true, tracking: true } }, sets: { orderBy: [asc(sets.position)] } },
        },
      },
    }),
    db.select().from(exercises).where(eq(exercises.userId, userId)),
    db.select().from(healthMetrics).where(eq(healthMetrics.userId, userId)).orderBy(asc(healthMetrics.day)),
    db.select().from(healthWorkouts).where(eq(healthWorkouts.userId, userId)).orderBy(asc(healthWorkouts.startAt)),
  ]);
  return {
    format: "workout-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    account: user,
    customExercises: custom.map((e) => omit(e, ["userId"])),
    workouts: allWorkouts.map((w) => ({
      ...omit(w, ["userId"]),
      exercises: w.exercises.map((we) => ({
        name: we.exercise.name,
        nameUk: we.exercise.nameUk,
        muscle: we.exercise.muscle,
        equipment: we.exercise.equipment,
        tracking: we.exercise.tracking,
        restSeconds: we.restSeconds,
        notes: we.notes,
        sets: we.sets.map((s) => omit(s, ["id", "workoutExerciseId"])),
      })),
    })),
    healthMetrics: metrics.map((m) => omit(m, ["id", "userId"])),
    watchWorkouts: watch.map((h) => omit(h, ["userId"])),
  };
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per set — opens directly in Excel / Numbers / Google Sheets. */
export async function exportSetsCsv(userId: string) {
  const ws = await db.select().from(workouts).where(eq(workouts.userId, userId)).orderBy(asc(workouts.startedAt));
  if (ws.length === 0) return "workout,status,date\n";
  const rows = await db
    .select({
      workoutId: workoutExercises.workoutId,
      position: workoutExercises.position,
      exercise: exercises.name,
      muscle: exercises.muscle,
      setNo: sets.position,
      type: sets.type,
      weight: sets.weight,
      reps: sets.reps,
      durationSec: sets.durationSec,
      distanceM: sets.distanceM,
      completed: sets.completed,
      completedAt: sets.completedAt,
    })
    .from(sets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(inArray(workoutExercises.workoutId, ws.map((w) => w.id)))
    .orderBy(asc(workoutExercises.position), asc(sets.position));
  const byWorkout = new Map(ws.map((w) => [w.id, w]));
  const header = ["workout", "status", "started_at", "ended_at", "exercise", "muscle", "set", "type", "weight_kg", "reps", "duration_sec", "distance_m", "completed", "completed_at"];
  const lines = rows
    .map((r) => ({ r, w: byWorkout.get(r.workoutId)! }))
    .sort((a, b) => (a.w.startedAt?.getTime() ?? 0) - (b.w.startedAt?.getTime() ?? 0) || a.r.position - b.r.position || a.r.setNo - b.r.setNo)
    .map(({ r, w }) =>
      [w.name, w.status, w.startedAt, w.endedAt, r.exercise, r.muscle, r.setNo + 1, r.type, r.weight, r.reps, r.durationSec, r.distanceM, r.completed, r.completedAt].map(csvCell).join(","),
    );
  return [header.join(","), ...lines].join("\n") + "\n";
}
