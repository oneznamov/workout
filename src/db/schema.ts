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
import type { AiProvider } from "../lib/ai-providers";
import type { Profile } from "../lib/profile";

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
  /** Bumped to sign the account out everywhere (password change, reset, "sign out all"). */
  sessionVersion: integer("session_version").notNull().default(0),
  /** Private training goals and notes about the athlete — read by Claude and the built-in AI coach, never shown to friends. */
  profile: jsonb("profile").$type<Profile>(),
  /** Optional AI provider for automatic analysis and planning. `key` is the API key encrypted with the server secret. */
  ai: jsonb("ai").$type<{ provider: AiProvider; model: string; key: string; hint: string; auto: boolean }>(),
  createdAt: createdAt(),
});

/** Texts written by the AI coach: one review per finished workout, one coaching note per day. */
export const aiNotes = pgTable(
  "ai_notes",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"workout" | "coach">().notNull(),
    /** Workout id for a review, the day (YYYY-MM-DD) for a coaching note. */
    ref: text("ref").notNull(),
    content: text("content").notNull(),
    model: text("model").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ai_notes_ref").on(t.userId, t.kind, t.ref)],
);

/** A friendship is stored once, with the smaller id first. Friends see each other's training totals. */
export const friendships = pgTable(
  "friendships",
  {
    id: id(),
    userA: uuid("user_a").notNull().references(() => users.id, { onDelete: "cascade" }),
    userB: uuid("user_b").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("friendships_pair").on(t.userA, t.userB), index("friendships_b").on(t.userB)],
);

/** A shareable "add me as a friend" link. One per user; reusable until it expires. */
export const friendLinks = pgTable("friend_links", {
  id: id(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/** A small circle that trains "together": everyone in a team sees everyone else's training totals. */
export const teams = pgTable("teams", {
  id: id(),
  name: text("name").notNull(),
  /** Optional join link: the hash of its token and when it stops working. */
  linkHash: text("link_hash").unique(),
  linkExpiresAt: timestamp("link_expires_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** One team per person. The member who joined first is the captain. */
export const teamMembers = pgTable(
  "team_members",
  {
    id: id(),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("team_members_team").on(t.teamId)],
);

/** "Join our team" — waits until the invited person accepts or declines it in the app. */
export const teamInvites = pgTable(
  "team_invites",
  {
    id: id(),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    invitedBy: uuid("invited_by").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("team_invites_pair").on(t.teamId, t.userId), index("team_invites_user").on(t.userId)],
);

/** One-time links an admin hands out so a user can set a new password. */
export const passwordResets = pgTable("password_resets", {
  id: id(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

/** Failed sign-ins, kept briefly to slow down password guessing. */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: id(),
    /** "u:<login>" or "ip:<address>" */
    key: text("key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("login_attempts_key_idx").on(t.key, t.createdAt)],
);

/** Server and browser errors, shown to the admin. */
export const errorLog = pgTable(
  "error_log",
  {
    id: id(),
    source: text("source").$type<"server" | "client">().notNull(),
    message: text("message").notNull(),
    detail: text("detail"),
    path: text("path"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("error_log_time_idx").on(t.createdAt)],
);

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

