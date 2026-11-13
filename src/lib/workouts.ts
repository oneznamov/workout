import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  exercises,
  healthWorkouts,
  SET_TYPES,
  sets,
  workoutExercises,
  workouts,
  type Equipment,
  type MuscleGroup,
  type SetType,
  type Tracking,
  type WorkoutStatus,
} from "@/db/schema";
import { dayOf } from "./format";
import { linkHealthWorkouts } from "./health";
import { normalizeComment, normalizeMood } from "./mood";

export class NotFoundError extends Error {
  constructor(what = "Не знайдено") {
    super(what);
  }
}

export type SetInput = {
  id?: string;
  type?: SetType;
  weight?: number | null;
  reps?: number | null;
  durationSec?: number | null;
  distanceM?: number | null;
  rpe?: number | null;
  completed?: boolean;
};

export type ExerciseInput = {
  id?: string;
  exerciseId: string;
  restSeconds?: number | null;
  notes?: string | null;
  sets?: SetInput[];
};

export type WorkoutInput = {
  name: string;
  status?: WorkoutStatus;
  scheduledFor?: string | null;
  notes?: string | null;
  exercises?: ExerciseInput[];
  programId?: string | null;
  /** how hard the planner expects it to feel, 1–10 */
  expectedEffort?: number | null;
};

// ───────────────────────── Exercises ─────────────────────────

const visibleExercise = (userId: string) => or(isNull(exercises.userId), eq(exercises.userId, userId));

export async function listExercises(
  userId: string,
  opts: { q?: string; muscle?: MuscleGroup; equipment?: Equipment; includeArchived?: boolean } = {},
) {
  const where = [visibleExercise(userId)];
  if (!opts.includeArchived) where.push(eq(exercises.archived, false));
  if (opts.muscle) where.push(eq(exercises.muscle, opts.muscle));
  if (opts.equipment) where.push(eq(exercises.equipment, opts.equipment));
  if (opts.q?.trim()) {
    const q = `%${opts.q.trim()}%`;
    where.push(or(ilike(exercises.name, q), ilike(exercises.nameUk, q)));
  }
  return db
    .select({
      id: exercises.id,
      name: exercises.name,
      nameUk: exercises.nameUk,
      muscle: exercises.muscle,
      secondaryMuscles: exercises.secondaryMuscles,
      equipment: exercises.equipment,
      tracking: exercises.tracking,
      custom: sql<boolean>`${exercises.userId} is not null`,
    })
    .from(exercises)
    .where(and(...where))
    .orderBy(asc(exercises.muscle), asc(exercises.name));
}

export async function getExercise(userId: string, id: string) {
  const [e] = await db
    .select()
    .from(exercises)
    .where(and(eq(exercises.id, id), visibleExercise(userId)));
  if (!e) throw new NotFoundError("Вправу не знайдено");
  return e;
}

export async function createExercise(
  userId: string,
  input: {
    name: string;
    nameUk?: string | null;
    muscle: MuscleGroup;
    secondaryMuscles?: MuscleGroup[];
    equipment: Equipment;
    tracking?: Tracking;
    notes?: string | null;
  },
) {
  const [e] = await db
    .insert(exercises)
    .values({
      userId,
      name: input.name.trim(),
      nameUk: input.nameUk?.trim() || null,
      muscle: input.muscle,
      secondaryMuscles: input.secondaryMuscles ?? [],
      equipment: input.equipment,
      tracking: input.tracking ?? "weight_reps",
      notes: input.notes ?? null,
    })
    .returning();
  return e;
}

/** Only the user's own (custom) exercises can be archived. */
export async function archiveExercise(userId: string, id: string) {
  await db
    .update(exercises)
    .set({ archived: true })
    .where(and(eq(exercises.id, id), eq(exercises.userId, userId)));
}

// ───────────────────────── Workouts: read ─────────────────────────

export async function getWorkout(userId: string, id: string) {
  const w = await db.query.workouts.findFirst({
    where: and(eq(workouts.id, id), eq(workouts.userId, userId)),
    with: {
      exercises: {
        orderBy: [asc(workoutExercises.position)],
        with: {
          exercise: {
            columns: { id: true, name: true, nameUk: true, muscle: true, equipment: true, tracking: true },
          },
          sets: { orderBy: [asc(sets.position)] },
        },
      },
      healthWorkouts: { orderBy: [asc(healthWorkouts.startAt)] },
    },
  });
  if (!w) throw new NotFoundError("Тренування не знайдено");
  return w;
}
export type WorkoutFull = Awaited<ReturnType<typeof getWorkout>>;

export async function listWorkouts(
  userId: string,
  opts: { status?: WorkoutStatus | WorkoutStatus[]; from?: string; to?: string; limit?: number; programId?: string } = {},
) {
  const where = [eq(workouts.userId, userId)];
  if (opts.programId) where.push(eq(workouts.programId, opts.programId));
  if (opts.status) where.push(inArray(workouts.status, Array.isArray(opts.status) ? opts.status : [opts.status]));
  const when = sql`coalesce(${workouts.startedAt}, ${workouts.scheduledFor}::timestamptz, ${workouts.createdAt})`;
  // `when` is a raw expression, so the bounds are passed as text and cast in SQL.
  if (opts.from) where.push(sql`${when} >= ${`${opts.from}T00:00:00Z`}::timestamptz`);
  if (opts.to) where.push(sql`${when} <= ${`${opts.to}T23:59:59Z`}::timestamptz`);

  return db
    .select({
      id: workouts.id,
      programId: workouts.programId,
      name: workouts.name,
      status: workouts.status,
      scheduledFor: workouts.scheduledFor,
      startedAt: workouts.startedAt,
      endedAt: workouts.endedAt,
      pausedSec: workouts.pausedSec,
      notes: workouts.notes,
      effort: workouts.effort,
      mood: workouts.mood,
      comment: workouts.comment,
      expectedEffort: workouts.expectedEffort,
      exerciseCount: sql<number>`(select count(*)::int from workout_exercises we where we.workout_id = "workouts"."id")`,
      setCount: sql<number>`(select count(*)::int from sets s join workout_exercises we on we.id = s.workout_exercise_id
        where we.workout_id = "workouts"."id" and (s.completed or "workouts"."status" <> 'completed'))`,
      volume: sql<number>`(select coalesce(sum(s.weight * s.reps), 0)::float from sets s join workout_exercises we on we.id = s.workout_exercise_id
        where we.workout_id = "workouts"."id" and s.completed)`,
      /** Exercises per primary muscle, e.g. {"chest": 2, "back": 3} — names the workout and draws its pictogram. */
      muscles: sql<Partial<Record<MuscleGroup, number>> | null>`(select jsonb_object_agg(t.muscle, t.n) from (
        select e.muscle, count(*)::int as n from workout_exercises we join exercises e on e.id = we.exercise_id
        where we.workout_id = "workouts"."id" group by e.muscle) t)`,
      avgHr: sql<number | null>`(select avg(h.avg_hr)::float from health_workouts h where h.workout_id = "workouts"."id")`,
      activeKcal: sql<number | null>`(select sum(h.active_kcal)::float from health_workouts h where h.workout_id = "workouts"."id")`,
    })
    .from(workouts)
    .where(and(...where))
    .orderBy(desc(when))
    .limit(opts.limit ?? 100);
}
export type WorkoutListItem = Awaited<ReturnType<typeof listWorkouts>>[number];

export type LastPerformance = Record<
  string,
  { date: Date | null; sets: { weight: number | null; reps: number | null; durationSec: number | null; distanceM: number | null; type: SetType }[] }
>;

/** For each exercise: the completed sets from the most recent finished workout that included it. */
export async function lastPerformance(
  userId: string,
  exerciseIds?: string[],
  excludeWorkoutId?: string,
): Promise<LastPerformance> {
  if (exerciseIds && exerciseIds.length === 0) return {};
  const where = [
    eq(workouts.userId, userId),
    eq(workouts.status, "completed"),
    sql`exists (select 1 from ${sets} s where s.workout_exercise_id = ${workoutExercises.id} and s.completed)`,
  ];
  if (exerciseIds) where.push(inArray(workoutExercises.exerciseId, exerciseIds));
  if (excludeWorkoutId) where.push(ne(workouts.id, excludeWorkoutId));
  const latest = await db
    .selectDistinctOn([workoutExercises.exerciseId], {
      exerciseId: workoutExercises.exerciseId,
      weId: workoutExercises.id,
      date: workouts.startedAt,
    })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(and(...where))
    .orderBy(workoutExercises.exerciseId, desc(workouts.startedAt));
  if (latest.length === 0) return {};
  const rows = await db
    .select()
    .from(sets)
    .where(and(inArray(sets.workoutExerciseId, latest.map((l) => l.weId)), eq(sets.completed, true)))
    .orderBy(asc(sets.position));
  const out: LastPerformance = {};
  for (const l of latest) {
    out[l.exerciseId] = {
      date: l.date,
      sets: rows
        .filter((r) => r.workoutExerciseId === l.weId)
        .map((r) => ({ weight: r.weight, reps: r.reps, durationSec: r.durationSec, distanceM: r.distanceM, type: r.type })),
    };
  }
  return out;
}

// ───────────────────────── Workouts: write ─────────────────────────

async function assertExercisesVisible(userId: string, ids: string[]) {
  const uniq = [...new Set(ids)];
  if (uniq.length === 0) return;
  const found = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(inArray(exercises.id, uniq), visibleExercise(userId)));
  if (found.length !== uniq.length) throw new NotFoundError("Вправу не знайдено");
}

async function ownWorkout(userId: string, id: string) {
  const [w] = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.id, id), eq(workouts.userId, userId)));
  if (!w) throw new NotFoundError("Тренування не знайдено");
  return w;
}

async function ownWorkoutExercise(userId: string, weId: string) {
  const [row] = await db
    .select({ id: workoutExercises.id, workoutId: workoutExercises.workoutId })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(and(eq(workoutExercises.id, weId), eq(workouts.userId, userId)));
  if (!row) throw new NotFoundError("Вправу в тренуванні не знайдено");
  return row;
}

async function ownSet(userId: string, setId: string) {
  const [row] = await db
    .select({ id: sets.id, workoutId: workoutExercises.workoutId })
    .from(sets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(and(eq(sets.id, setId), eq(workouts.userId, userId)));
  if (!row) throw new NotFoundError("Підхід не знайдено");
  return row;
}

const touch = (workoutId: string) =>
  db.update(workouts).set({ updatedAt: new Date() }).where(eq(workouts.id, workoutId));

const clampInt = (v: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(v)) || 0));

function setValues(weId: string, position: number, s: SetInput) {
  const completed = s.completed ?? false;
  return {
    ...(s.id ? { id: s.id } : {}),
    workoutExerciseId: weId,
    position,
    type: s.type ?? ("normal" as SetType),
    weight: s.weight ?? null,
    reps: s.reps ?? null,
    durationSec: s.durationSec ?? null,
    distanceM: s.distanceM ?? null,
    rpe: s.rpe ?? null,
    completed,
    completedAt: completed ? new Date() : null,
  };
}

async function insertExercises(workoutId: string, items: ExerciseInput[], startPosition = 0) {
  for (const [i, ex] of items.entries()) {
    const [we] = await db
      .insert(workoutExercises)
      .values({
        ...(ex.id ? { id: ex.id } : {}),
        workoutId,
        exerciseId: ex.exerciseId,
        position: startPosition + i,
        restSeconds: ex.restSeconds ?? null,
        notes: ex.notes ?? null,
      })
      .returning({ id: workoutExercises.id });
    if (ex.sets?.length) {
      await db.insert(sets).values(ex.sets.map((s, j) => setValues(we.id, j, s)));
    }
  }
}

export async function createWorkout(userId: string, input: WorkoutInput) {
  await assertExercisesVisible(userId, (input.exercises ?? []).map((e) => e.exerciseId));
  const status = input.status ?? "planned";
  const now = new Date();
  const [w] = await db
    .insert(workouts)
    .values({
      userId,
      name: input.name.trim() || "Тренування",
      status,
      scheduledFor: input.scheduledFor ?? null,
      notes: input.notes ?? null,
      programId: input.programId ?? null,
      expectedEffort: input.expectedEffort ?? null,
      startedAt: status === "in_progress" ? now : null,
    })
    .returning({ id: workouts.id });
  if (input.exercises?.length) await insertExercises(w.id, input.exercises);
  return w.id;
}

export async function updateWorkout(
  userId: string,
  id: string,
  patch: { name?: string; notes?: string | null; scheduledFor?: string | null; startedAt?: Date; endedAt?: Date; effort?: number | null; expectedEffort?: number | null },
) {
  await ownWorkout(userId, id);
  await db
    .update(workouts)
    .set({ ...patch, ...(patch.name != null ? { name: patch.name.trim() || "Тренування" } : {}), updatedAt: new Date() })
    .where(eq(workouts.id, id));
}

export async function setWorkoutProgram(userId: string, id: string, programId: string | null) {
  await ownWorkout(userId, id);
  await db.update(workouts).set({ programId, updatedAt: new Date() }).where(eq(workouts.id, id));
}

/** Replaces the whole exercise/set plan of a workout (used by Claude to rewrite a plan). */
export async function replaceWorkoutPlan(userId: string, id: string, items: ExerciseInput[]) {
  await ownWorkout(userId, id);
  await assertExercisesVisible(userId, items.map((e) => e.exerciseId));
  await db.delete(workoutExercises).where(eq(workoutExercises.workoutId, id));
  await insertExercises(id, items);
  await touch(id);
}

export async function startWorkout(userId: string, id: string) {
  const w = await ownWorkout(userId, id);
  if (w.status === "template") return duplicateWorkout(userId, id, { status: "in_progress" });
  if (w.status === "planned") {
    await db
      .update(workouts)
      .set({ status: "in_progress", startedAt: new Date(), endedAt: null, updatedAt: new Date() })
      .where(eq(workouts.id, id));
  }
  return id;
}

export async function finishWorkout(userId: string, id: string) {
  const w = await ownWorkout(userId, id);
  if (w.status !== "in_progress") return;
  // A finished session records only what was actually done.
  await db.execute(sql`
    delete from ${sets} s using ${workoutExercises} we
    where s.workout_exercise_id = we.id and we.workout_id = ${id} and not s.completed`);
  await db.execute(sql`
    delete from ${workoutExercises} we
    where we.workout_id = ${id} and not exists (select 1 from ${sets} s where s.workout_exercise_id = we.id)`);
  await db
    .update(workouts)
    .set({ status: "completed", endedAt: new Date(), updatedAt: new Date() })
    .where(eq(workouts.id, id));
  await linkHealthWorkouts(userId);
}

/** Re-opens a finished workout so it can be continued/edited live. */
export async function resumeWorkout(userId: string, id: string) {
  const w = await ownWorkout(userId, id);
  if (w.status !== "completed") return;
  await db
    .update(workouts)
    .set({ status: "in_progress", endedAt: null, updatedAt: new Date() })
    .where(eq(workouts.id, id));
}

export async function deleteWorkout(userId: string, id: string) {
  await db.delete(workouts).where(and(eq(workouts.id, id), eq(workouts.userId, userId)));
}

/** Copies a workout (template → session, "repeat last workout", save as template…). */
export async function duplicateWorkout(
  userId: string,
  id: string,
  opts: { status: WorkoutStatus; name?: string; scheduledFor?: string | null },
) {
  const src = await getWorkout(userId, id);
  return createWorkout(userId, {
    name: opts.name ?? src.name,
    status: opts.status,
    scheduledFor: opts.scheduledFor ?? (opts.status === "planned" ? dayOf() : null),
    notes: src.notes,
    expectedEffort: src.expectedEffort,
    exercises: src.exercises.map((we) => ({
      exerciseId: we.exerciseId,
      restSeconds: we.restSeconds,
      notes: we.notes,
      sets: we.sets
        // When copying a finished session keep only what was actually done.
        .filter((s) => src.status !== "completed" || s.completed)
        .map((s) => ({
          type: s.type,
          weight: s.weight,
          reps: s.reps,
          durationSec: s.durationSec,
          distanceM: s.distanceM,
        })),
    })),
  });
}

export async function addWorkoutExercise(userId: string, workoutId: string, item: ExerciseInput) {
  await ownWorkout(userId, workoutId);
  await assertExercisesVisible(userId, [item.exerciseId]);
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${workoutExercises.position}), -1)::int` })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId));
  await insertExercises(workoutId, [item], max + 1);
  await touch(workoutId);
}

export async function updateWorkoutExercise(
  userId: string,
  weId: string,
  patch: { restSeconds?: number | null; notes?: string | null; exerciseId?: string },
) {
  const we = await ownWorkoutExercise(userId, weId);
  if (patch.exerciseId) await assertExercisesVisible(userId, [patch.exerciseId]);
  // Only these fields may change: whatever else the caller sent (e.g. another workout's id) is ignored.
  const set: { restSeconds?: number | null; notes?: string | null; exerciseId?: string } = {};
  if (patch.restSeconds !== undefined) set.restSeconds = patch.restSeconds == null ? null : clampInt(patch.restSeconds, 0, 3600);
  if (patch.notes !== undefined) set.notes = patch.notes == null ? null : String(patch.notes).slice(0, 2000);
  if (patch.exerciseId) set.exerciseId = String(patch.exerciseId);
  if (Object.keys(set).length === 0) return;
  await db.update(workoutExercises).set(set).where(eq(workoutExercises.id, weId));
  await touch(we.workoutId);
}

export async function removeWorkoutExercise(userId: string, weId: string) {
  const we = await ownWorkoutExercise(userId, weId);
  await db.delete(workoutExercises).where(eq(workoutExercises.id, weId));
  await touch(we.workoutId);
}

export async function reorderWorkoutExercises(userId: string, workoutId: string, orderedIds: string[]) {
  await ownWorkout(userId, workoutId);
  for (const [i, weId] of orderedIds.entries()) {
    await db
      .update(workoutExercises)
      .set({ position: i })
      .where(and(eq(workoutExercises.id, weId), eq(workoutExercises.workoutId, workoutId)));
  }
  await touch(workoutId);
}

export async function addSet(userId: string, weId: string, input: SetInput) {
  const we = await ownWorkoutExercise(userId, weId);
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${sets.position}), -1)::int` })
    .from(sets)
    .where(eq(sets.workoutExerciseId, weId));
  const [s] = await db.insert(sets).values(setValues(weId, max + 1, input)).returning({ id: sets.id });
  await touch(we.workoutId);
  return s.id;
}

export async function updateSet(userId: string, setId: string, patch: SetInput) {
  const s = await ownSet(userId, setId);
  // Field by field, never the caller's object as it came: a set must not be movable into someone else's workout.
  const num = (v: unknown) => (v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const set: Partial<typeof sets.$inferInsert> = {};
  if (patch.type !== undefined && (SET_TYPES as readonly string[]).includes(patch.type)) set.type = patch.type;
  if (patch.weight !== undefined) set.weight = num(patch.weight);
  if (patch.reps !== undefined) set.reps = patch.reps == null ? null : clampInt(patch.reps, 0, 10000);
  if (patch.durationSec !== undefined) set.durationSec = patch.durationSec == null ? null : clampInt(patch.durationSec, 0, 86400);
  if (patch.distanceM !== undefined) set.distanceM = num(patch.distanceM);
  if (patch.rpe !== undefined) set.rpe = num(patch.rpe);
  if (typeof patch.completed === "boolean") {
    set.completed = patch.completed;
    set.completedAt = patch.completed ? new Date() : null;
  }
  if (Object.keys(set).length === 0) return;
  await db
    .update(sets)
    .set(set)
    .where(eq(sets.id, setId));
  await touch(s.workoutId);
}

export async function deleteSet(userId: string, setId: string) {
  const s = await ownSet(userId, setId);
  await db.delete(sets).where(eq(sets.id, setId));
  await touch(s.workoutId);
}

/** Replaces all sets of one exercise inside a workout. */
export async function replaceSets(userId: string, weId: string, items: SetInput[]) {
  const we = await ownWorkoutExercise(userId, weId);
  await db.delete(sets).where(eq(sets.workoutExerciseId, weId));
  if (items.length) await db.insert(sets).values(items.map((s, i) => setValues(weId, i, s)));
  await touch(we.workoutId);
}

// ───────────────────────── Device sync ─────────────────────────

export type SnapshotInput = {
  name: string;
  status: WorkoutStatus;
  scheduledFor: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  pausedSec: number;
  pausedAt: Date | null;
  notes: string | null;
  /** undefined = the device does not know about the rating; leave what is stored */
  effort?: number | null;
  /** the same for the mood and the athlete's note */
  mood?: string | null;
  comment?: string | null;
  exercises: {
    id: string;
    exerciseId: string;
    restSeconds: number | null;
    notes: string | null;
    sets: {
      id: string;
      type: SetType;
      weight: number | null;
      reps: number | null;
      durationSec: number | null;
      distanceM: number | null;
      speedKmh?: number | null;
      incline?: number | null;
      completed: boolean;
      completedAt: Date | null;
    }[];
  }[];
  deletedExerciseIds: string[];
  deletedSetIds: string[];
};

/**
 * Saves a whole workout as edited on a device (possibly offline, possibly created there).
 * Rows are upserted by id and only explicitly deleted ids are removed, so anything added
 * on the server meanwhile (e.g. by Claude) survives the merge.
 */
export async function saveSnapshot(userId: string, id: string, snap: SnapshotInput) {
  const [existing] = await db.select().from(workouts).where(eq(workouts.id, id));
  if (existing && existing.userId !== userId) throw new NotFoundError("Тренування не знайдено");
  await assertExercisesVisible(userId, snap.exercises.map((e) => e.exerciseId));

  const meta = {
    name: snap.name.trim() || "Тренування",
    status: snap.status,
    scheduledFor: snap.scheduledFor,
    startedAt: snap.startedAt,
    endedAt: snap.endedAt,
    pausedSec: snap.pausedSec,
    pausedAt: snap.status === "in_progress" ? snap.pausedAt : null,
    notes: snap.notes,
    ...(snap.effort !== undefined ? { effort: snap.effort } : {}),
    ...(snap.mood !== undefined ? { mood: normalizeMood(snap.mood) } : {}),
    ...(snap.comment !== undefined ? { comment: normalizeComment(snap.comment) } : {}),
    updatedAt: new Date(),
  };
  if (existing) await db.update(workouts).set(meta).where(eq(workouts.id, id));
  else await db.insert(workouts).values({ id, userId, ...meta });

  const ownExercises = db.select({ id: workoutExercises.id }).from(workoutExercises).where(eq(workoutExercises.workoutId, id));
  if (snap.deletedSetIds.length) {
    await db.delete(sets).where(and(inArray(sets.id, snap.deletedSetIds), inArray(sets.workoutExerciseId, ownExercises)));
  }
  if (snap.deletedExerciseIds.length) {
    await db
      .delete(workoutExercises)
      .where(and(inArray(workoutExercises.id, snap.deletedExerciseIds), eq(workoutExercises.workoutId, id)));
  }

  if (snap.exercises.length) {
    await db
      .insert(workoutExercises)
      .values(
        snap.exercises.map((e, i) => ({
          id: e.id,
          workoutId: id,
          exerciseId: e.exerciseId,
          position: i,
          restSeconds: e.restSeconds,
          notes: e.notes,
        })),
      )
      .onConflictDoUpdate({
        target: workoutExercises.id,
        set: {
          exerciseId: sql`excluded.exercise_id`,
          position: sql`excluded.position`,
          restSeconds: sql`excluded.rest_seconds`,
          notes: sql`excluded.notes`,
        },
        // Never touch a row that belongs to another workout.
        setWhere: sql`workout_exercises.workout_id = excluded.workout_id`,
      });

    const confirmed = new Set(
      (
        await db
          .select({ id: workoutExercises.id })
          .from(workoutExercises)
          .where(and(eq(workoutExercises.workoutId, id), inArray(workoutExercises.id, snap.exercises.map((e) => e.id))))
      ).map((r) => r.id),
    );
    const now = new Date();
    const rows = snap.exercises
      .filter((e) => confirmed.has(e.id))
      .flatMap((e) =>
        e.sets.map((s, j) => ({
          id: s.id,
          workoutExerciseId: e.id,
          position: j,
          type: s.type,
          weight: s.weight,
          reps: s.reps,
          durationSec: s.durationSec,
          distanceM: s.distanceM,
          speedKmh: s.speedKmh ?? null,
          incline: s.incline ?? null,
          completed: s.completed,
          completedAt: s.completed ? (s.completedAt ?? now) : null,
        })),
      );
    if (rows.length) {
      await db
        .insert(sets)
        .values(rows)
        .onConflictDoUpdate({
          target: sets.id,
          set: {
            position: sql`excluded.position`,
            type: sql`excluded.type`,
            weight: sql`excluded.weight`,
            reps: sql`excluded.reps`,
            durationSec: sql`excluded.duration_sec`,
            distanceM: sql`excluded.distance_m`,
            speedKmh: sql`excluded.speed_kmh`,
            incline: sql`excluded.incline`,
            completed: sql`excluded.completed`,
            completedAt: sql`excluded.completed_at`,
          },
          setWhere: sql`sets.workout_exercise_id = excluded.workout_exercise_id`,
        });
    }
  }

  // Just finished (or logged as finished): keep only what was done and attach watch data.
  if (snap.status === "completed" && existing?.status !== "completed") {
    await db.execute(sql`
      delete from ${sets} s using ${workoutExercises} we
      where s.workout_exercise_id = we.id and we.workout_id = ${id} and not s.completed`);
    await db.execute(sql`
      delete from ${workoutExercises} we
      where we.workout_id = ${id} and not exists (select 1 from ${sets} s where s.workout_exercise_id = we.id)`);
    await linkHealthWorkouts(userId);
  }

  return getWorkout(userId, id);
}

/** Full detail of every workout the user may want to open without a connection. */
export async function listWorkoutsFull(userId: string, statuses: WorkoutStatus[], limit = 40) {
  return db.query.workouts.findMany({
    where: and(eq(workouts.userId, userId), inArray(workouts.status, statuses)),
    orderBy: [desc(workouts.updatedAt)],
    limit,
    with: {
      exercises: {
        orderBy: [asc(workoutExercises.position)],
        with: {
          exercise: {
            columns: { id: true, name: true, nameUk: true, muscle: true, equipment: true, tracking: true },
          },
          sets: { orderBy: [asc(sets.position)] },
        },
      },
      healthWorkouts: { orderBy: [asc(healthWorkouts.startAt)] },
    },
  });
}
