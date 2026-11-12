import { getUserId } from "@/lib/auth";
import { toClientLast, toClientWorkout, type OfflineBundle } from "@/lib/shape";
import { lastPerformance, listExercises, listWorkoutsFull } from "@/lib/workouts";

/** Everything the device needs to run a workout without a connection. */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const [workouts, exercises, last] = await Promise.all([
    listWorkoutsFull(userId, ["planned", "in_progress", "template"]),
    listExercises(userId),
    lastPerformance(userId),
  ]);
  const bundle: OfflineBundle = {
    workouts: workouts.map(toClientWorkout),
    exercises: exercises
      .map(({ id, name, nameUk, muscle, equipment, tracking }) => ({ id, name, nameUk, muscle, equipment, tracking }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    last: toClientLast(last),
    fetchedAt: new Date().toISOString(),
  };
  return Response.json(bundle, { headers: { "Cache-Control": "no-store" } });
}
