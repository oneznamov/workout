import { z } from "zod";
import { EQUIPMENT, MUSCLE_GROUPS, SET_TYPES, TRACKING, WORKOUT_STATUS } from "@/db/schema";

/**
 * The shape of a data export as the import reads it. Lenient on purpose: a file made by an
 * older version, or edited by hand, should still come in — odd values fall back to safe ones
 * and unknown fields are ignored.
 */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const stamp = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)))
  .nullish()
  .catch(null);
const num = z.number().finite().nullish().catch(null);
const int = z.number().int().min(0).max(1_000_000).nullish().catch(null);
const text = (max: number) => z.string().max(max).nullish().catch(null);
const id = z.string().uuid().optional().catch(undefined);

const set = z.object({
  type: z.enum(SET_TYPES).catch("normal"),
  weight: num,
  reps: int,
  durationSec: int,
  distanceM: num,
  speedKmh: num,
  incline: num,
  rpe: num,
  completed: z.boolean().catch(false),
  completedAt: stamp,
});

const exercise = z.object({
  name: z.string().trim().min(1).max(120),
  nameUk: text(120),
  muscle: z.enum(MUSCLE_GROUPS).catch("full_body"),
  equipment: z.enum(EQUIPMENT).catch("other"),
  tracking: z.enum(TRACKING).catch("weight_reps"),
});

const workout = z.object({
  id,
  programId: z.string().uuid().nullish().catch(null),
  name: z.string().trim().min(1).max(200).catch("Тренування"),
  status: z.enum(WORKOUT_STATUS),
  scheduledFor: day.nullish().catch(null),
  startedAt: stamp,
  endedAt: stamp,
  pausedSec: z.number().int().min(0).max(86400).catch(0),
  notes: text(5000),
  effort: z.number().int().min(1).max(10).nullish().catch(null),
  mood: z.string().max(16).nullish().catch(null),
  comment: text(1000),
  createdAt: stamp,
  exercises: z
    .array(exercise.extend({ restSeconds: z.number().int().min(0).max(3600).nullish().catch(null), notes: text(2000), sets: z.array(set).max(100).catch([]) }))
    .max(100)
    .catch([]),
});

const program = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  description: z.string().max(2000).catch(""),
  forecast: z.string().max(2000).catch(""),
  startsOn: day,
  endsOn: day,
  createdAt: stamp,
  revisions: z
    .array(z.object({ source: z.enum(["manual", "ai", "claude"]).catch("manual"), summary: z.string().max(2000).catch(""), snapshot: z.unknown(), createdAt: stamp }))
    .max(300)
    .catch([]),
});

export const importSchema = z.object({
  format: z.literal("workout-export"),
  version: z.number().int().min(1).max(9),
  profile: z.unknown().optional(),
  customExercises: z.array(exercise).max(2000).catch([]).default([]),
  programs: z.array(program).max(300).catch([]).default([]),
  workouts: z.array(workout).max(6000).default([]),
  healthMetrics: z
    .array(z.object({ metric: z.string().min(1).max(60), day, value: z.number().finite(), unit: text(20), source: z.string().max(40).catch("manual") }))
    .max(60000)
    .catch([])
    .default([]),
  ai: z
    .object({ notes: z.array(z.object({ kind: z.string(), ref: z.string().max(80), content: z.string().max(20000), model: z.string().max(120).catch(""), createdAt: stamp })).max(6000).catch([]) })
    .partial()
    .optional()
    .catch(undefined),
});
export type ImportData = z.infer<typeof importSchema>;
export type ImportResult = { workouts: number; programs: number; exercises: number; metrics: number; notes: number; skipped: number; profile: boolean };
