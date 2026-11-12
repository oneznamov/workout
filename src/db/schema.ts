import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: id(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  /** Weekly targets for the dashboard rings; null = defaults. */
  goals: jsonb("goals").$type<{ workouts: number; cardioMin: number; muscles: number }>(),
  /** Home-screen layout: widget order and hidden widgets; null = defaults. */
  dashboard: jsonb("dashboard").$type<{ order: string[]; hidden: string[] }>(),
  /** Can manage users and invitations. The first account is the admin. */
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: createdAt(),
});

/** One-time sign-up links. Registration is closed; an invite is the only way in. */
export const invites = pgTable("invites", {
  id: id(),
  tokenHash: text("token_hash").notNull().unique(),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  usedBy: uuid("used_by").references(() => users.id, { onDelete: "set null" }),
});

/** Personal access tokens used by Claude (MCP) and the Apple Health exporter. */
export const apiTokens = pgTable("api_tokens", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  prefix: text("prefix").notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const MUSCLE_GROUPS = [
  "chest", "back", "shoulders", "biceps", "triceps", "forearms",
  "quads", "hamstrings", "glutes", "calves", "core", "cardio", "full_body",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const EQUIPMENT = [
  "barbell", "dumbbell", "machine", "cable", "bodyweight", "kettlebell", "band", "smith", "other",
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

/**
 * weight_reps — штанга/гантелі/тренажер; reps — власна вага (опційно + додаткова вага);
 * duration — планка тощо; distance — кардіо (дистанція + час).
 */
export const TRACKING = ["weight_reps", "reps", "duration", "distance"] as const;
export type Tracking = (typeof TRACKING)[number];

export const exercises = pgTable(
  "exercises",
  {
    id: id(),
    /** null = вбудована вправа, доступна всім */
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug"),
    name: text("name").notNull(),
    nameUk: text("name_uk"),
    muscle: text("muscle").$type<MuscleGroup>().notNull(),
    secondaryMuscles: jsonb("secondary_muscles").$type<MuscleGroup[]>().notNull().default([]),
    equipment: text("equipment").$type<Equipment>().notNull(),
    tracking: text("tracking").$type<Tracking>().notNull().default("weight_reps"),
    notes: text("notes"),
    archived: boolean("archived").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("exercises_slug_idx").on(t.slug), index("exercises_user_idx").on(t.userId)],
);

export const WORKOUT_STATUS = ["template", "planned", "in_progress", "completed"] as const;
export type WorkoutStatus = (typeof WORKOUT_STATUS)[number];

export const workouts = pgTable(
  "workouts",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status").$type<WorkoutStatus>().notNull().default("planned"),
    scheduledFor: date("scheduled_for"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** Seconds spent on pause so far (finished pauses only). Active time = total − paused. */
    pausedSec: integer("paused_sec").notNull().default(0),
    /** Set while the workout is paused right now. */
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("workouts_user_idx").on(t.userId, t.status, t.startedAt)],
);

export const workoutExercises = pgTable(
  "workout_exercises",
  {
    id: id(),
    workoutId: uuid("workout_id").notNull().references(() => workouts.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id").notNull().references(() => exercises.id),
    position: integer("position").notNull().default(0),
    restSeconds: integer("rest_seconds"),
    notes: text("notes"),
  },
  (t) => [index("workout_exercises_workout_idx").on(t.workoutId), index("workout_exercises_exercise_idx").on(t.exerciseId)],
);

export const SET_TYPES = ["normal", "warmup", "drop", "failure"] as const;
export type SetType = (typeof SET_TYPES)[number];

export const sets = pgTable(
  "sets",
  {
    id: id(),
    workoutExerciseId: uuid("workout_exercise_id")
      .notNull()
      .references(() => workoutExercises.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    type: text("type").$type<SetType>().notNull().default("normal"),
    weight: doublePrecision("weight"),
    reps: integer("reps"),
    durationSec: integer("duration_sec"),
    distanceM: doublePrecision("distance_m"),
    rpe: doublePrecision("rpe"),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("sets_we_idx").on(t.workoutExerciseId)],
);

/** Денні показники: вага тіла, пульс спокою, HRV, кроки тощо (Apple Health або вручну). */
export const healthMetrics = pgTable(
  "health_metrics",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    metric: text("metric").notNull(),
    day: date("day").notNull(),
    value: doublePrecision("value").notNull(),
    unit: text("unit"),
    source: text("source").notNull().default("manual"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("health_metrics_uniq").on(t.userId, t.metric, t.day)],
);

export type HrSample = { t: string; bpm: number };

/** Тренування, записані Apple Watch (додаток «Тренування»). */
export const healthWorkouts = pgTable(
  "health_workouts",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    activityType: text("activity_type").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    durationSec: integer("duration_sec"),
    activeKcal: doublePrecision("active_kcal"),
    totalKcal: doublePrecision("total_kcal"),
    avgHr: doublePrecision("avg_hr"),
    maxHr: doublePrecision("max_hr"),
    minHr: doublePrecision("min_hr"),
    distanceM: doublePrecision("distance_m"),
    hrSamples: jsonb("hr_samples").$type<HrSample[]>(),
    workoutId: uuid("workout_id").references(() => workouts.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("health_workouts_ext").on(t.userId, t.externalId),
    index("health_workouts_time").on(t.userId, t.startAt),
  ],
);

export const workoutsRelations = relations(workouts, ({ many }) => ({
  exercises: many(workoutExercises),
  healthWorkouts: many(healthWorkouts),
}));
export const workoutExercisesRelations = relations(workoutExercises, ({ one, many }) => ({
  workout: one(workouts, { fields: [workoutExercises.workoutId], references: [workouts.id] }),
  exercise: one(exercises, { fields: [workoutExercises.exerciseId], references: [exercises.id] }),
  sets: many(sets),
}));
export const setsRelations = relations(sets, ({ one }) => ({
  workoutExercise: one(workoutExercises, {
    fields: [sets.workoutExerciseId],
    references: [workoutExercises.id],
  }),
}));
export const healthWorkoutsRelations = relations(healthWorkouts, ({ one }) => ({
  workout: one(workouts, { fields: [healthWorkouts.workoutId], references: [workouts.id] }),
}));

