import { z } from "zod";
import { SET_TYPES, WORKOUT_STATUS } from "@/db/schema";
import { getUserId } from "@/lib/auth";
import { toClientWorkout } from "@/lib/shape";
import { getWorkout, NotFoundError, saveSnapshot } from "@/lib/workouts";

const uuid = z.string().uuid();
const iso = z.string().datetime({ offset: true }).nullable();
const num = z.number().finite().nullable();

const snapshotSchema = z.object({
  workout: z.object({
    name: z.string().max(200),
    status: z.enum(WORKOUT_STATUS),
    scheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    startedAt: iso,
    endedAt: iso,
    pausedSec: z.number().int().min(0).max(86400).optional(),
    pausedAt: iso.optional(),
    notes: z.string().max(5000).nullable(),
    // Absent in copies saved by an older version of the app — then the stored rating stays.
    effort: z.number().int().min(1).max(10).nullable().optional(),
    exercises: z
      .array(
        z.object({
          id: uuid,
          exercise: z.object({ id: uuid }),
          restSeconds: z.number().int().min(0).max(3600).nullable(),
          notes: z.string().max(2000).nullable(),
          sets: z
            .array(
              z.object({
                id: uuid,
                type: z.enum(SET_TYPES),
                weight: num,
                reps: z.number().int().min(0).max(100000).nullable(),
                durationSec: z.number().int().min(0).nullable(),
                distanceM: num,
                speedKmh: z.number().min(0).max(100).nullable().optional(),
                incline: z.number().min(-30).max(60).nullable().optional(),
                completed: z.boolean(),
                completedAt: iso.optional(),
              }),
            )
            .max(100),
        }),
      )
      .max(100),
  }),
  deletedExerciseIds: z.array(uuid).max(500).default([]),
  deletedSetIds: z.array(uuid).max(2000).default([]),
});

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Polled by the workout screen so edits made elsewhere (e.g. by Claude) show up mid-session. */
export async function GET(_req: Request, ctx: RouteContext<"/api/workouts/[id]">) {
  const userId = await getUserId();
  if (!userId) return json({ error: "unauthorized" }, 401);
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) return json({ error: "not_found" }, 404);
  try {
    return json(toClientWorkout(await getWorkout(userId, id)));
  } catch (e) {
    if (e instanceof NotFoundError) return json({ error: "not_found" }, 404);
    throw e;
  }
}

/** Saves the whole workout as edited on the device; creates it if it was started offline. */
export async function PUT(req: Request, ctx: RouteContext<"/api/workouts/[id]">) {
  const userId = await getUserId();
  if (!userId) return json({ error: "unauthorized" }, 401);
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) return json({ error: "bad_id" }, 400);

  const parsed = snapshotSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "invalid", issues: parsed.error.issues.slice(0, 5) }, 400);
  const { workout: w, deletedExerciseIds, deletedSetIds } = parsed.data;
  const date = (v: string | null | undefined) => (v ? new Date(v) : null);

  try {
    const saved = await saveSnapshot(userId, id, {
      name: w.name,
      status: w.status,
      scheduledFor: w.scheduledFor,
      startedAt: date(w.startedAt),
      endedAt: date(w.endedAt),
      pausedSec: w.pausedSec ?? 0,
      pausedAt: date(w.pausedAt),
      notes: w.notes,
      effort: w.effort,
      exercises: w.exercises.map((e) => ({
        id: e.id,
        exerciseId: e.exercise.id,
        restSeconds: e.restSeconds,
        notes: e.notes,
        sets: e.sets.map((s) => ({ ...s, completedAt: date(s.completedAt) })),
      })),
      deletedExerciseIds,
      deletedSetIds,
    });
    return json(toClientWorkout(saved));
  } catch (e) {
    if (e instanceof NotFoundError) return json({ error: "not_found" }, 404);
    throw e;
  }
}
