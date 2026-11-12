"use server";

import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { apiTokens, EQUIPMENT, errorLog, MUSCLE_GROUPS, TRACKING, users, type WorkoutStatus } from "@/db/schema";
import { bumpSessionVersion, createSession, destroySession, generateApiToken, getAdmin, requireUserId } from "./auth";
import { addDays, dayOf } from "./format";
import { addManualCardio, deleteManualCardio } from "./cardio";
import { WIDGETS } from "./dashboard";
import { normalizeGoals, type Goals } from "./goals";
import { acceptInvite, createInvite, deleteUser, revokeInvite } from "./invites";
import { clearFailedLogins, clientIp, loginBlockedFor, recordFailedLogin } from "./rate-limit";
import { completePasswordReset, createPasswordReset } from "./resets";
import * as health from "./health";
import { isMeasure } from "./measurements";
import * as team from "./team";
import * as wk from "./workouts";
import type { ExerciseInput, SetInput } from "./workouts";

// ───────────────────────── Auth ─────────────────────────

export type AuthState = { error?: string } | undefined;

const credentials = z.object({
  username: z.string().trim().toLowerCase().min(2, "Логін надто короткий").max(64),
  password: z.string().min(8, "Пароль має містити щонайменше 8 символів").max(200),
});

export async function hasAnyUser() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  return n > 0;
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { username, password } = parsed.data;

  // Slow down password guessing: a few misses per login (or many per address) pause sign-in.
  const ip = await clientIp();
  const wait = await loginBlockedFor(username, ip);
  if (wait > 0) return { error: `Забагато невдалих спроб. Спробуйте ще раз через ${Math.ceil(wait / 60)} хв.` };

  const [user] = await db.select().from(users).where(eq(users.username, username));
  const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !ok) {
    await recordFailedLogin(username, ip);
    await new Promise((r) => setTimeout(r, 600));
    return { error: "Невірний логін або пароль" };
  }
  await clearFailedLogins(username);
  await createSession(user.id, user.sessionVersion);
  // Come back to where the visitor was heading (e.g. a team link), local paths only.
  const next = String(formData.get("next") ?? "");
  redirect(/^\/(?!\/)[\w\-./#?=&%]*$/.test(next) ? next : "/");
}

/** First-run only: creates the single owner account. Closed once any user exists. */
export async function setupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (await hasAnyUser()) return { error: "Акаунт уже створено — увійдіть" };
  const parsed = credentials.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { username, password } = parsed.data;
  const [user] = await db
    .insert(users)
    .values({ username, passwordHash: await bcrypt.hash(password, 12), isAdmin: true })
    .returning({ id: users.id });
  await createSession(user.id);
  redirect("/");
}

/** Sign-up through an invitation link: login + password typed twice. */
export async function acceptInviteAction(token: string, _prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (formData.get("password") !== formData.get("confirm")) return { error: "Паролі не збігаються" };
  const result = await acceptInvite(token, parsed.data.username, parsed.data.password);
  if ("error" in result) return { error: result.error };
  await createSession(result.userId);
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export type PasswordState = { error?: string; ok?: boolean } | undefined;

export async function changePasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const userId = await requireUserId();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  if (next.length < 8) return { error: "Новий пароль має містити щонайменше 8 символів" };
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) return { error: "Поточний пароль невірний" };
  await db.update(users).set({ passwordHash: await bcrypt.hash(next, 12) }).where(eq(users.id, userId));
  // A new password signs every other device out; this one gets a fresh session.
  await createSession(userId, await bumpSessionVersion(userId));
  return { ok: true };
}

/** "Sign out everywhere else": every other device loses its session, this one stays in. */
export async function signOutOthersAction() {
  const userId = await requireUserId();
  await createSession(userId, await bumpSessionVersion(userId));
}

/** Setting a new password through a one-time link from the admin. */
export async function resetPasswordAction(token: string, _prev: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Пароль має містити щонайменше 8 символів" };
  if (password !== formData.get("confirm")) return { error: "Паролі не збігаються" };
  const result = await completePasswordReset(token, password);
  if (!result) return { error: "Посилання недійсне або вже використане" };
  await createSession(result.userId, result.sessionVersion);
  redirect("/");
}

// ───────────────────────── Workouts ─────────────────────────

export async function createWorkoutAction(input: {
  name?: string;
  status: WorkoutStatus;
  scheduledFor?: string | null;
}) {
  const userId = await requireUserId();
  const id = await wk.createWorkout(userId, {
    name: input.name?.trim() || defaultName(input.status),
    status: input.status,
    scheduledFor: input.status === "planned" ? (input.scheduledFor ?? dayOf()) : null,
  });
  redirect(`/workouts/${id}`);
}

function defaultName(status: WorkoutStatus) {
  if (status === "template") return "Новий шаблон";
  return "Тренування";
}

export async function startWorkoutAction(id: string) {
  const userId = await requireUserId();
  const newId = await wk.startWorkout(userId, id);
  redirect(`/workouts/${newId}`);
}

export async function finishWorkoutAction(id: string) {
  const userId = await requireUserId();
  await wk.finishWorkout(userId, id);
}

export async function resumeWorkoutAction(id: string) {
  const userId = await requireUserId();
  await wk.resumeWorkout(userId, id);
}

export async function deleteWorkoutAction(id: string) {
  const userId = await requireUserId();
  await wk.deleteWorkout(userId, id);
  redirect("/workouts");
}

export async function duplicateWorkoutAction(id: string, status: WorkoutStatus) {
  const userId = await requireUserId();
  const newId = await wk.duplicateWorkout(userId, id, { status });
  redirect(`/workouts/${newId}`);
}

export async function updateWorkoutAction(
  id: string,
  patch: { name?: string; notes?: string | null; scheduledFor?: string | null; startedAt?: string; endedAt?: string },
) {
  const userId = await requireUserId();
  await wk.updateWorkout(userId, id, {
    ...(patch.name != null ? { name: patch.name } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(patch.scheduledFor !== undefined ? { scheduledFor: patch.scheduledFor } : {}),
    ...(patch.startedAt ? { startedAt: new Date(patch.startedAt) } : {}),
    ...(patch.endedAt ? { endedAt: new Date(patch.endedAt) } : {}),
  });
}

export async function addExerciseAction(workoutId: string, item: ExerciseInput) {
  const userId = await requireUserId();
  await wk.addWorkoutExercise(userId, workoutId, item);
}

export async function updateWorkoutExerciseAction(
  weId: string,
  patch: { restSeconds?: number | null; notes?: string | null },
) {
  const userId = await requireUserId();
  await wk.updateWorkoutExercise(userId, weId, patch);
}

export async function removeWorkoutExerciseAction(weId: string) {
  const userId = await requireUserId();
  await wk.removeWorkoutExercise(userId, weId);
}

export async function reorderExercisesAction(workoutId: string, orderedIds: string[]) {
  const userId = await requireUserId();
  await wk.reorderWorkoutExercises(userId, workoutId, orderedIds);
}

export async function addSetAction(weId: string, input: SetInput) {
  const userId = await requireUserId();
  await wk.addSet(userId, weId, input);
}

export async function updateSetAction(setId: string, patch: SetInput) {
  const userId = await requireUserId();
  await wk.updateSet(userId, setId, patch);
}

export async function deleteSetAction(setId: string) {
  const userId = await requireUserId();
  await wk.deleteSet(userId, setId);
}

// ───────────────────────── Exercises ─────────────────────────

const exerciseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  muscle: z.enum(MUSCLE_GROUPS),
  equipment: z.enum(EQUIPMENT),
  tracking: z.enum(TRACKING),
});

export async function createExerciseAction(input: z.infer<typeof exerciseSchema>) {
  const userId = await requireUserId();
  const data = exerciseSchema.parse(input);
  const e = await wk.createExercise(userId, data);
  return { id: e.id, name: e.name, nameUk: e.nameUk, muscle: e.muscle, equipment: e.equipment, tracking: e.tracking };
}

export async function archiveExerciseAction(id: string) {
  const userId = await requireUserId();
  await wk.archiveExercise(userId, id);
  redirect("/exercises");
}

/** Moves a planned workout to today (0) or a few days ahead. */
export async function rescheduleWorkoutAction(id: string, inDays: number) {
  const userId = await requireUserId();
  const days = Math.min(14, Math.max(0, Math.round(inDays)));
  await wk.updateWorkout(userId, id, { scheduledFor: addDays(dayOf(), days) });
}

// ───────────────────────── Health & body ─────────────────────────

export async function logMetricAction(metric: string, day: string, value: number) {
  const userId = await requireUserId();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(value)) throw new Error("Некоректні дані");
  await health.upsertMetric(userId, metric, day, value, "manual");
}

/** Tape measurements for a day; empty fields are left as they were. */
export async function saveMeasurementsAction(day: string, values: Record<string, number | null>) {
  const userId = await requireUserId();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Некоректна дата");
  for (const [key, value] of Object.entries(values)) {
    if (!isMeasure(key) || value == null || !Number.isFinite(value) || value < 10 || value > 300) continue;
    await health.upsertMetric(userId, key, day, Math.round(value * 10) / 10, "manual");
  }
}

export async function deleteMetricAction(metric: string, day: string) {
  const userId = await requireUserId();
  await health.deleteMetric(userId, metric, day);
}

export async function linkHealthWorkoutAction(healthWorkoutId: string, workoutId: string | null) {
  const userId = await requireUserId();
  await health.setHealthWorkoutLink(userId, healthWorkoutId, workoutId);
}

// ───────────────────────── API tokens ─────────────────────────

export async function createTokenAction(name: string) {
  const userId = await requireUserId();
  const t = generateApiToken();
  await db.insert(apiTokens).values({ userId, name: name.trim() || "Токен", tokenHash: t.hash, prefix: t.prefix });
  return t.token;
}

export async function deleteTokenAction(id: string) {
  const userId = await requireUserId();
  await db.delete(apiTokens).where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)));
}

// ───────────────────────── Cardio ─────────────────────────

const cardioSchema = z.object({
  kind: z.enum(["run", "cycle"]),
  startAt: z.string().datetime({ offset: true }),
  durationMin: z.number().positive().max(24 * 60),
  distanceKm: z.number().min(0).max(1000).nullable(),
  avgHr: z.number().min(30).max(240).nullable(),
});

export async function addCardioAction(input: z.infer<typeof cardioSchema>) {
  const userId = await requireUserId();
  const d = cardioSchema.parse(input);
  await addManualCardio(userId, {
    kind: d.kind,
    startAt: new Date(d.startAt),
    durationSec: Math.round(d.durationMin * 60),
    distanceM: d.distanceKm != null ? Math.round(d.distanceKm * 1000) : null,
    avgHr: d.avgHr,
  });
}

export async function deleteCardioAction(id: string) {
  const userId = await requireUserId();
  await deleteManualCardio(userId, id);
  redirect("/workouts?t=cardio");
}

// ───────────────────────── Goals ─────────────────────────

export async function saveGoalsAction(input: Goals) {
  const userId = await requireUserId();
  const goals = normalizeGoals(input);
  await db.update(users).set({ goals }).where(eq(users.id, userId));
  return goals;
}

// ───────────────────────── Admin ─────────────────────────

async function requireAdmin() {
  const admin = await getAdmin();
  if (!admin) throw new Error("forbidden");
  return admin;
}

export async function createInviteAction(note: string) {
  const admin = await requireAdmin();
  return createInvite(admin.id, note.slice(0, 120));
}

export async function revokeInviteAction(id: string) {
  await requireAdmin();
  await revokeInvite(id);
}

export async function deleteUserAction(id: string) {
  const admin = await requireAdmin();
  if (id === admin.id) throw new Error("cannot delete yourself");
  await deleteUser(id);
}

// ───────────────────────── Home screen ─────────────────────────

export async function saveDashboardAction(input: { order: string[]; hidden: string[] }) {
  const userId = await requireUserId();
  const known = new Set<string>(WIDGETS.map((w) => w.id));
  const clean = (ids: string[]) => [...new Set(ids)].filter((id) => known.has(id));
  await db.update(users).set({ dashboard: { order: clean(input.order), hidden: clean(input.hidden) } }).where(eq(users.id, userId));
}

/** Admin: a one-time link with which the user sets a new password (valid for 24 hours). */
export async function createResetLinkAction(userId: string) {
  await requireAdmin();
  return createPasswordReset(userId);
}

export async function clearErrorsAction() {
  await requireAdmin();
  await db.delete(errorLog);
}

// ───────────────────────── Team ─────────────────────────

export type TeamResult = { error?: string };

/** Runs a team change; a refusal meant for the user comes back as text instead of a crash. */
async function teamChange(fn: (userId: string) => Promise<unknown>): Promise<TeamResult> {
  const userId = await requireUserId();
  try {
    await fn(userId);
    return {};
  } catch (e) {
    if (e instanceof team.TeamError) return { error: e.message };
    throw e;
  }
}

export async function inviteToTeamAction(targetId: string) {
  return teamChange((userId) => team.inviteToTeam(userId, targetId));
}

export async function cancelTeamInviteAction(targetId: string) {
  return teamChange((userId) => team.cancelTeamInvite(userId, targetId));
}

export async function respondTeamInviteAction(inviteId: string, accept: boolean) {
  return teamChange((userId) => team.respondTeamInvite(userId, inviteId, accept));
}

export async function leaveTeamAction() {
  return teamChange((userId) => team.leaveTeam(userId));
}

export async function removeFromTeamAction(targetId: string) {
  return teamChange((userId) => team.removeFromTeam(userId, targetId));
}

export async function renameTeamAction(name: string) {
  return teamChange((userId) => team.renameTeam(userId, name));
}

export async function reactToWorkoutAction(workoutId: string, emoji: string | null) {
  return teamChange((userId) => team.reactToWorkout(userId, workoutId, emoji));
}

export async function setTeamChallengeAction(challenge: { metric: string; target: number; mode: "each" | "team" } | null) {
  return teamChange((userId) => team.setTeamChallenge(userId, challenge));
}

export async function createTeamLinkAction() {
  return team.createTeamLink(await requireUserId());
}

export async function revokeTeamLinkAction() {
  await team.revokeTeamLink(await requireUserId());
}

export async function joinTeamByLinkAction(token: string): Promise<TeamResult> {
  const r = await teamChange((userId) => team.joinTeamByLink(userId, token));
  if (r.error) return r;
  redirect("/team");
}

