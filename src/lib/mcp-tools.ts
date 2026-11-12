import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { EQUIPMENT, MUSCLE_GROUPS, SET_TYPES, TRACKING } from "@/db/schema";
import { getExerciseHistory, getMuscleSummary, getTrainingAnalytics } from "./analytics";
import { addManualCardio, listCardio } from "./cardio";
import { CARDIO_LABEL, paceLabel } from "./cardio-kinds";
import { addDays, dayOf } from "./format";
import * as health from "./health";
import { toClientWorkout } from "./shape";
import { buildTimeline } from "./timeline";
import { METRIC_INFO } from "./labels";
import * as wk from "./workouts";
import type { ExerciseInput, SetInput } from "./workouts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

const setSchema = z.object({
  type: z.enum(SET_TYPES).optional().describe("normal (default), warmup, drop, failure"),
  weight_kg: z.number().min(0).nullable().optional().describe("Load in kg. For bodyweight exercises: extra weight, or omit."),
  reps: z.number().int().min(0).nullable().optional(),
  duration_sec: z.number().int().min(0).nullable().optional().describe("For timed exercises (plank, cardio)."),
  distance_m: z.number().min(0).nullable().optional().describe("For cardio, in meters."),
  completed: z.boolean().optional().describe("Mark the set as already performed. Leave false/omitted for planned targets."),
});

const exerciseSchema = z.object({
  exercise: z.string().describe("Exercise id (uuid) or exact name from list_exercises, e.g. 'Barbell Bench Press'."),
  rest_seconds: z.number().int().min(0).max(1800).nullable().optional().describe("Rest between sets."),
  notes: z.string().nullable().optional().describe("Coaching cue shown under the exercise."),
  sets: z.array(setSchema).optional().describe("Planned sets in order. Defaults to none."),
});

type SetArg = z.infer<typeof setSchema>;
type ExerciseArg = z.infer<typeof exerciseSchema>;

const toSet = (s: SetArg, forceCompleted = false): SetInput => ({
  type: s.type,
  weight: s.weight_kg ?? null,
  reps: s.reps ?? null,
  durationSec: s.duration_sec ?? null,
  distanceM: s.distance_m ?? null,
  completed: forceCompleted || (s.completed ?? false),
});

async function resolveExercise(userId: string, ref: string): Promise<string> {
  const r = ref.trim();
  if (UUID.test(r)) return (await wk.getExercise(userId, r)).id;
  const all = await wk.listExercises(userId);
  const lower = r.toLowerCase();
  const exact = all.filter((e) => e.name.toLowerCase() === lower || e.nameUk?.toLowerCase() === lower);
  if (exact.length === 1) return exact[0].id;
  const partial = all.filter((e) => e.name.toLowerCase().includes(lower) || e.nameUk?.toLowerCase().includes(lower));
  if (partial.length === 1) return partial[0].id;
  const hint = partial.length
    ? `Ambiguous — candidates: ${partial.slice(0, 8).map((e) => `"${e.name}"`).join(", ")}`
    : "No match — call list_exercises, or create_exercise for a new one";
  throw new Error(`Exercise "${ref}" not resolved. ${hint}.`);
}

async function toExerciseInputs(userId: string, items: ExerciseArg[], forceCompleted = false): Promise<ExerciseInput[]> {
  const out: ExerciseInput[] = [];
  for (const it of items) {
    out.push({
      exerciseId: await resolveExercise(userId, it.exercise),
      restSeconds: it.rest_seconds ?? null,
      notes: it.notes ?? null,
      sets: (it.sets ?? []).map((s) => toSet(s, forceCompleted)),
    });
  }
  return out;
}

async function describeWorkout(userId: string, id: string, includeHeartRate = false) {
  const w = await wk.getWorkout(userId, id);
  return {
    workout_id: w.id,
    name: w.name,
    status: w.status,
    date: w.scheduledFor ?? (w.startedAt ? dayOf(w.startedAt) : null),
    started_at: w.startedAt,
    ended_at: w.endedAt,
    duration_min: w.startedAt && w.endedAt ? Math.round((w.endedAt.getTime() - w.startedAt.getTime()) / 60000) : null,
    notes: w.notes,
    exercises: w.exercises.map((we) => ({
      workout_exercise_id: we.id,
      exercise_id: we.exercise.id,
      exercise: we.exercise.name,
      muscle: we.exercise.muscle,
      tracking: we.exercise.tracking,
      rest_seconds: we.restSeconds,
      notes: we.notes,
      sets: we.sets.map((s) => ({
        set_id: s.id,
        type: s.type,
        weight_kg: s.weight,
        reps: s.reps,
        duration_sec: s.durationSec,
        distance_m: s.distanceM,
        completed: s.completed,
        completed_at: s.completedAt,
      })),
    })),
    apple_watch: w.healthWorkouts.map((h) => ({
      activity: h.activityType,
      start: h.startAt,
      end: h.endAt,
      duration_min: h.durationSec != null ? Math.round(h.durationSec / 60) : null,
      active_kcal: h.activeKcal != null ? Math.round(h.activeKcal) : null,
      avg_hr: h.avgHr != null ? Math.round(h.avgHr) : null,
      max_hr: h.maxHr != null ? Math.round(h.maxHr) : null,
      min_hr: h.minHr != null ? Math.round(h.minHr) : null,
      ...(includeHeartRate && h.hrSamples
        ? { heart_rate: thin(h.hrSamples, 120).map((s) => ({ t: s.t, bpm: s.bpm })) }
        : {}),
    })),
  };
}

function thin<T>(arr: T[], max: number) {
  const step = Math.ceil(arr.length / max);
  return step > 1 ? arr.filter((_, i) => i % step === 0) : arr;
}

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 1) }] });

/** Wraps a tool body so thrown errors come back as readable tool errors. */
function tool<A>(fn: (args: A) => Promise<unknown>) {
  return async (args: A) => {
    try {
      return ok(await fn(args));
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
    }
  };
}

export function registerWorkoutTools(server: McpServer, userId: string) {
  // ───────────── Exercises ─────────────
  server.registerTool(
    "list_exercises",
    {
      title: "List exercises",
      description:
        "Search the exercise library (built-in gym exercises plus the user's custom ones). Use the returned names/ids when building workouts.",
      inputSchema: z.object({
        query: z.string().optional().describe("Substring of the English or Ukrainian name."),
        muscle: z.enum(MUSCLE_GROUPS).optional(),
        equipment: z.enum(EQUIPMENT).optional(),
      }),
    },
    tool(async ({ query, muscle, equipment }) => {
      const rows = await wk.listExercises(userId, { q: query, muscle, equipment });
      return rows.map((e) => ({
        id: e.id,
        name: e.name,
        name_uk: e.nameUk,
        muscle: e.muscle,
        secondary: e.secondaryMuscles,
        equipment: e.equipment,
        tracking: e.tracking,
        custom: e.custom,
      }));
    }),
  );

  server.registerTool(
    "create_exercise",
    {
      title: "Create custom exercise",
      description: "Adds a custom exercise to the user's library. Check list_exercises first to avoid duplicates.",
      inputSchema: z.object({
        name: z.string().min(2),
        name_uk: z.string().optional(),
        muscle: z.enum(MUSCLE_GROUPS).describe("Primary muscle group."),
        secondary_muscles: z.array(z.enum(MUSCLE_GROUPS)).optional(),
        equipment: z.enum(EQUIPMENT),
        tracking: z
          .enum(TRACKING)
          .default("weight_reps")
          .describe("weight_reps = load × reps; reps = bodyweight reps; duration = timed; distance = cardio."),
      }),
    },
    tool(async (a) => {
      const e = await wk.createExercise(userId, {
        name: a.name,
        nameUk: a.name_uk,
        muscle: a.muscle,
        secondaryMuscles: a.secondary_muscles,
        equipment: a.equipment,
        tracking: a.tracking,
      });
      return { id: e.id, name: e.name };
    }),
  );

  // ───────────── Workouts: read ─────────────
  server.registerTool(
    "list_workouts",
    {
      title: "List workouts",
      description:
        "Lists workouts with summary numbers (exercise count, sets, volume in kg, Apple Watch avg HR / kcal). Statuses: planned (future plan), in_progress (being performed right now), completed (history), template (reusable routine).",
      inputSchema: z.object({
        status: z.enum(["planned", "in_progress", "completed", "template"]).optional(),
        from: day.optional(),
        to: day.optional(),
        limit: z.number().int().min(1).max(200).default(30),
      }),
    },
    tool(async ({ status, from, to, limit }) => {
      const rows = await wk.listWorkouts(userId, { status, from, to, limit });
      return rows.map((w) => ({
        workout_id: w.id,
        name: w.name,
        status: w.status,
        date: w.scheduledFor ?? (w.startedAt ? dayOf(w.startedAt) : null),
        started_at: w.startedAt,
        duration_min: w.startedAt && w.endedAt ? Math.round((w.endedAt.getTime() - w.startedAt.getTime()) / 60000) : null,
        exercises: w.exerciseCount,
        sets: w.setCount,
        volume_kg: Math.round(w.volume),
        avg_hr: w.avgHr != null ? Math.round(w.avgHr) : null,
        active_kcal: w.activeKcal != null ? Math.round(w.activeKcal) : null,
        notes: w.notes,
      }));
    }),
  );

  server.registerTool(
    "get_workout",
    {
      title: "Get workout",
      description:
        "Full detail of one workout: every exercise and set (with ids for editing) plus linked Apple Watch data (duration, calories, heart rate).",
      inputSchema: z.object({
        workout_id: z.string(),
        include_heart_rate: z.boolean().default(false).describe("Include the heart-rate time series recorded by Apple Watch."),
      }),
    },
    tool(({ workout_id, include_heart_rate }) => describeWorkout(userId, workout_id, include_heart_rate)),
  );

  server.registerTool(
    "get_workout_timeline",
    {
      title: "Workout timeline",
      description:
        "Reconstructs a finished workout minute by minute: when each set was done, the rest before it, peak heart rate per set, average rest per exercise, work vs rest time and time in heart-rate zones. mode=logged uses the times sets were ticked off; mode=estimated infers them from heart-rate peaks (see confidence). Use it to analyse pacing, rest discipline and effort.",
      inputSchema: z.object({ workout_id: z.string() }),
    },
    tool(async ({ workout_id }) => {
      const timeline = buildTimeline(toClientWorkout(await wk.getWorkout(userId, workout_id)));
      return timeline ?? { error: "No timeline: the workout is not finished, has no completed sets, or has neither set times nor heart-rate data." };
    }),
  );

  // ───────────── Workouts: write ─────────────
  server.registerTool(
    "create_workout",
    {
      title: "Create workout",
      description:
        "Creates a workout. status=planned schedules it for `date` (the user starts it from the app); template saves a reusable routine; completed logs a past session (requires started_at and ended_at; all sets are stored as performed).",
      inputSchema: z.object({
        name: z.string().min(1),
        status: z.enum(["planned", "template", "completed"]).default("planned"),
        date: day.optional().describe("Scheduled day for a planned workout. Defaults to today."),
        started_at: z.string().optional().describe("ISO datetime — only for status=completed."),
        ended_at: z.string().optional().describe("ISO datetime — only for status=completed."),
        notes: z.string().optional(),
        exercises: z.array(exerciseSchema).default([]),
      }),
    },
    tool(async (a) => {
      const completed = a.status === "completed";
      if (completed && (!a.started_at || !a.ended_at)) throw new Error("started_at and ended_at are required for a completed workout");
      const id = await wk.createWorkout(userId, {
        name: a.name,
        status: a.status,
        scheduledFor: a.status === "planned" ? (a.date ?? dayOf()) : null,
        notes: a.notes ?? null,
        exercises: await toExerciseInputs(userId, a.exercises, completed),
      });
      if (completed) {
        await wk.updateWorkout(userId, id, { startedAt: new Date(a.started_at!), endedAt: new Date(a.ended_at!) });
        await health.linkHealthWorkouts(userId);
      }
      return describeWorkout(userId, id);
    }),
  );

  server.registerTool(
    "update_workout",
    {
      title: "Update workout",
      description:
        "Updates a workout's name, notes or date. Passing `exercises` REPLACES the whole exercise/set list — use that for planned workouts and templates. For a workout that is in_progress prefer add_exercise_to_workout / update_workout_exercise / remove_workout_exercise so sets already performed are kept.",
      inputSchema: z.object({
        workout_id: z.string(),
        name: z.string().optional(),
        notes: z.string().nullable().optional(),
        date: day.nullable().optional(),
        exercises: z.array(exerciseSchema).optional(),
      }),
    },
    tool(async (a) => {
      await wk.updateWorkout(userId, a.workout_id, {
        ...(a.name != null ? { name: a.name } : {}),
        ...(a.notes !== undefined ? { notes: a.notes } : {}),
        ...(a.date !== undefined ? { scheduledFor: a.date } : {}),
      });
      if (a.exercises) await wk.replaceWorkoutPlan(userId, a.workout_id, await toExerciseInputs(userId, a.exercises));
      return describeWorkout(userId, a.workout_id);
    }),
  );

  server.registerTool(
    "add_exercise_to_workout",
    {
      title: "Add exercise to workout",
      description: "Appends one exercise (with sets) to a workout. Safe to use while the workout is in progress — it appears in the app within seconds.",
      inputSchema: z.object({ workout_id: z.string(), ...exerciseSchema.shape }),
    },
    tool(async ({ workout_id, ...item }) => {
      const [input] = await toExerciseInputs(userId, [item]);
      await wk.addWorkoutExercise(userId, workout_id, input);
      return describeWorkout(userId, workout_id);
    }),
  );

  server.registerTool(
    "update_workout_exercise",
    {
      title: "Update exercise inside a workout",
      description:
        "Edits one exercise entry of a workout (workout_exercise_id from get_workout): swap the exercise, change rest/notes, or replace its sets. When replacing sets of an in-progress workout, re-send already performed sets with completed=true.",
      inputSchema: z.object({
        workout_exercise_id: z.string(),
        exercise: z.string().optional().describe("Swap to another exercise (id or name)."),
        rest_seconds: z.number().int().min(0).max(1800).nullable().optional(),
        notes: z.string().nullable().optional(),
        sets: z.array(setSchema).optional().describe("Replaces all sets of this exercise."),
      }),
    },
    tool(async (a) => {
      const patch: Parameters<typeof wk.updateWorkoutExercise>[2] = {};
      if (a.exercise) patch.exerciseId = await resolveExercise(userId, a.exercise);
      if (a.rest_seconds !== undefined) patch.restSeconds = a.rest_seconds;
      if (a.notes !== undefined) patch.notes = a.notes;
      if (Object.keys(patch).length) await wk.updateWorkoutExercise(userId, a.workout_exercise_id, patch);
      if (a.sets) await wk.replaceSets(userId, a.workout_exercise_id, a.sets.map((s) => toSet(s)));
      return { ok: true };
    }),
  );

  server.registerTool(
    "remove_workout_exercise",
    {
      title: "Remove exercise from workout",
      description: "Removes one exercise entry (and its sets) from a workout.",
      inputSchema: z.object({ workout_exercise_id: z.string() }),
    },
    tool(async ({ workout_exercise_id }) => {
      await wk.removeWorkoutExercise(userId, workout_exercise_id);
      return { ok: true };
    }),
  );

  server.registerTool(
    "duplicate_workout",
    {
      title: "Duplicate workout",
      description: "Copies a workout or template into a new planned workout or template (e.g. schedule a template for a date, or repeat last week's session).",
      inputSchema: z.object({
        workout_id: z.string(),
        status: z.enum(["planned", "template"]).default("planned"),
        date: day.optional(),
        name: z.string().optional(),
      }),
    },
    tool(async (a) => {
      const id = await wk.duplicateWorkout(userId, a.workout_id, { status: a.status, scheduledFor: a.date, name: a.name });
      return describeWorkout(userId, id);
    }),
  );

  server.registerTool(
    "delete_workout",
    {
      title: "Delete workout",
      description: "Permanently deletes a workout. Confirm with the user before deleting completed workouts.",
      inputSchema: z.object({ workout_id: z.string() }),
    },
    tool(async ({ workout_id }) => {
      await wk.getWorkout(userId, workout_id);
      await wk.deleteWorkout(userId, workout_id);
      return { ok: true };
    }),
  );

  // ───────────── Analysis ─────────────
  server.registerTool(
    "get_training_analytics",
    {
      title: "Training analytics",
      description:
        "Aggregated training stats for the last N weeks: per-week workouts / duration / volume / sets, working sets per muscle group, and per-exercise sessions, max weight and estimated 1RM.",
      inputSchema: z.object({ weeks: z.number().int().min(1).max(104).default(12) }),
    },
    tool(({ weeks }) => getTrainingAnalytics(userId, weeks)),
  );

  server.registerTool(
    "get_muscle_balance",
    {
      title: "Muscle balance",
      description:
        "Per-muscle-group training load in points (a hard set = 1 for the primary muscle, 0.5 for secondaries; easier sets count less; cardio adds ~1 point per 10 min to the legs it works), this week and week by week, with status vs the 10–20 points-per-week guideline, when each group was last trained and what loaded it. Use it to find undertrained muscle groups and decide what the next workouts should target.",
      inputSchema: z.object({ weeks: z.number().int().min(1).max(52).default(8) }),
    },
    tool(({ weeks }) => getMuscleSummary(userId, weeks)),
  );

  server.registerTool(
    "get_exercise_history",
    {
      title: "Exercise history",
      description: "Session-by-session history of one exercise: every performed set, volume, top weight and estimated 1RM. Use it to judge progression and choose next loads.",
      inputSchema: z.object({ exercise: z.string().describe("Exercise id or name."), limit: z.number().int().min(1).max(200).default(20) }),
    },
    tool(async ({ exercise, limit }) => getExerciseHistory(userId, await resolveExercise(userId, exercise), limit)),
  );

  // ───────────── Health ─────────────
  server.registerTool(
    "get_health_metrics",
    {
      title: "Health metrics",
      description: `Daily body & Apple Health metrics. Without \`metrics\` returns which metrics exist. Known metrics: ${Object.keys(METRIC_INFO).join(", ")}.`,
      inputSchema: z.object({
        metrics: z.array(z.string()).optional(),
        from: day.optional().describe("Defaults to 30 days ago."),
        to: day.optional(),
      }),
    },
    tool(async ({ metrics, from, to }) => {
      if (!metrics?.length) {
        const available = await health.listAvailableMetrics(userId);
        return available.map((a) => ({ metric: a.metric, label: METRIC_INFO[a.metric]?.label, unit: METRIC_INFO[a.metric]?.unit, days: a.count, last_day: a.lastDay }));
      }
      const rows = await health.getMetricSeries(userId, metrics, from ?? addDays(dayOf(), -30), to);
      const out: Record<string, { unit: string | undefined; values: Record<string, number> }> = {};
      for (const r of rows) {
        out[r.metric] ??= { unit: METRIC_INFO[r.metric]?.unit, values: {} };
        out[r.metric].values[r.day] = Math.round(r.value * 100) / 100;
      }
      return out;
    }),
  );

  server.registerTool(
    "list_watch_workouts",
    {
      title: "Apple Watch workouts",
      description: "Workouts recorded by Apple Watch (any activity type), with duration, calories, heart rate and the gym-log workout they are linked to, if any.",
      inputSchema: z.object({ from: day.optional(), to: day.optional(), limit: z.number().int().min(1).max(200).default(30) }),
    },
    tool(async (a) => {
      const rows = await health.listHealthWorkouts(userId, a);
      return rows.map((h) => ({
        activity: h.activityType,
        start: h.startAt,
        duration_min: h.durationSec != null ? Math.round(h.durationSec / 60) : null,
        active_kcal: h.activeKcal != null ? Math.round(h.activeKcal) : null,
        avg_hr: h.avgHr != null ? Math.round(h.avgHr) : null,
        max_hr: h.maxHr != null ? Math.round(h.maxHr) : null,
        distance_km: h.distanceM != null ? Math.round(h.distanceM / 10) / 100 : null,
        linked_workout_id: h.workoutId,
      }));
    }),
  );

  server.registerTool(
    "list_cardio_sessions",
    {
      title: "Cardio sessions",
      description: "Runs, rides and other cardio (from Apple Watch or added by hand) with distance, duration, pace or speed and heart rate. Cardio also counts toward muscle load in get_muscle_balance.",
      inputSchema: z.object({ from: day.optional().describe("Defaults to 30 days ago."), to: day.optional(), kind: z.enum(["run", "cycle", "walk", "other"]).optional() }),
    },
    tool(async ({ from, to, kind }) => {
      const rows = await listCardio(userId, { from: from ?? addDays(dayOf(), -30), to });
      return rows
        .filter((s) => !kind || s.kind === kind)
        .map((s) => ({
          id: s.id,
          kind: s.kind,
          label: CARDIO_LABEL[s.kind],
          start: s.startAt,
          duration_min: Math.round(s.durationSec / 60),
          distance_km: s.distanceM != null ? Math.round(s.distanceM / 10) / 100 : null,
          pace_or_speed: paceLabel(s.kind, s.distanceM, s.durationSec),
          avg_hr: s.avgHr != null ? Math.round(s.avgHr) : null,
          max_hr: s.maxHr != null ? Math.round(s.maxHr) : null,
          active_kcal: s.activeKcal != null ? Math.round(s.activeKcal) : null,
          source: s.manual ? "manual" : "apple_watch",
          part_of_workout_id: s.workoutId,
        }));
    }),
  );

  server.registerTool(
    "log_cardio_session",
    {
      title: "Log a run or ride",
      description: "Adds a run or a bike ride by hand (use only when the Apple Watch did not record it, to avoid duplicates).",
      inputSchema: z.object({
        kind: z.enum(["run", "cycle"]),
        started_at: z.string().describe("ISO datetime with offset."),
        duration_min: z.number().positive().max(1440),
        distance_km: z.number().min(0).max(1000).optional(),
        avg_hr: z.number().min(30).max(240).optional(),
      }),
    },
    tool(async (a) => {
      const id = await addManualCardio(userId, {
        kind: a.kind,
        startAt: new Date(a.started_at),
        durationSec: Math.round(a.duration_min * 60),
        distanceM: a.distance_km != null ? Math.round(a.distance_km * 1000) : null,
        avgHr: a.avg_hr ?? null,
      });
      return { ok: true, id };
    }),
  );

  server.registerTool(
    "log_body_metric",
    {
      title: "Log body metric",
      description: "Records a manual body measurement for a day (overwrites that day's value).",
      inputSchema: z.object({
        metric: z.enum(["body_mass", "body_fat_percentage", "lean_body_mass"]).describe("body_mass and lean_body_mass in kg, body_fat_percentage in %."),
        value: z.number().positive(),
        date: day.optional().describe("Defaults to today."),
      }),
    },
    tool(async ({ metric, value, date }) => {
      await health.upsertMetric(userId, metric, date ?? dayOf(), value, "claude");
      return { ok: true };
    }),
  );
}
