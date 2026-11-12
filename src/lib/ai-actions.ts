"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  AiError,
  analyzeWorkout,
  coachNote,
  listUnreviewed,
  periodReport,
  planProgram,
  planWorkout,
  removeAiSettings,
  reviseWorkout,
  saveAiSettings,
  supplementWorkout,
  testAi,
} from "./ai";
import { AI_PROVIDER_IDS, type AiNote, type AiResult } from "./ai-providers";
import { requireUserId } from "./auth";
import { logError } from "./errors";
import { currentGoalValues } from "./goal-progress";
import { normalizeProfile, type Profile } from "./profile";

/** Runs an AI call and turns failures into a message the interface can show. */
async function attempt<T extends object>(what: string, fn: (userId: string) => Promise<T>): Promise<AiResult<T>> {
  const userId = await requireUserId();
  try {
    return { ok: true, ...(await fn(userId)) };
  } catch (e) {
    if (e instanceof AiError) return { ok: false, error: e.message };
    await logError({ source: "server", message: `AI ${what}: ${e instanceof Error ? e.message : String(e)}`, userId });
    return { ok: false, error: "Не вдалося отримати відповідь ШІ. Спробуйте ще раз." };
  }
}

const settings = z.object({
  provider: z.enum(AI_PROVIDER_IDS as [string, ...string[]]),
  model: z.string().max(80),
  apiKey: z.string().max(400).optional(),
  auto: z.boolean(),
});

export async function saveAiSettingsAction(input: z.input<typeof settings>): Promise<AiResult<object>> {
  const parsed = settings.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Перевірте поля форми." };
  return attempt("settings", async (userId) => {
    await saveAiSettings(userId, { ...parsed.data, provider: parsed.data.provider as (typeof AI_PROVIDER_IDS)[number] });
    return {};
  });
}

export async function removeAiSettingsAction() {
  await removeAiSettings(await requireUserId());
}

export async function testAiAction() {
  return attempt("test", (userId) => testAi(userId));
}

export async function analyzeWorkoutAction(workoutId: string, force = false): Promise<AiResult<{ note: AiNote }>> {
  return attempt("workout review", async (userId) => ({ note: await analyzeWorkout(userId, workoutId, force) }));
}

export async function coachNoteAction(force = false): Promise<AiResult<{ note: AiNote }>> {
  return attempt("coach note", async (userId) => ({ note: await coachNote(userId, force) }));
}

export async function planWorkoutAction(input: { wish?: string; date?: string }) {
  return attempt("plan", (userId) => planWorkout(userId, input));
}

/** Several planned workouts at once: on the chosen days, or `count` sessions spread over a week by the model. */
export async function planProgramAction(input: { wish?: string; days?: string[]; count?: number; from?: string }) {
  return attempt("programme", (userId) => planProgram(userId, input));
}

/** Rebuilds an already planned workout following what the athlete says has changed. */
export async function reviseWorkoutAction(workoutId: string, instruction: string) {
  return attempt("revise", (userId) => reviseWorkout(userId, workoutId, instruction));
}

export async function periodReportAction(weeks: number, force = false): Promise<AiResult<{ note: AiNote }>> {
  return attempt("report", async (userId) => ({ note: await periodReport(userId, weeks, force) }));
}

/** Finished workouts that have no review yet (watch records are matched to them first). */
export async function unreviewedWorkoutsAction() {
  return attempt("backlog", async (userId) => ({ workouts: await listUnreviewed(userId) }));
}

export async function supplementWorkoutAction(workoutId: string) {
  return attempt("supplement", (userId) => supplementWorkout(userId, workoutId));
}

/** Private data about the athlete: who they are, their goals, their own notes. Only the given fields change. */
export async function saveProfileAction(patch: Partial<Profile>): Promise<Profile> {
  const userId = await requireUserId();
  const [u] = await db.select({ profile: users.profile }).from(users).where(eq(users.id, userId));
  const profile = normalizeProfile({ ...normalizeProfile(u?.profile), ...patch });
  // A goal that has just become measurable remembers the value it starts from.
  const fresh = profile.goals.filter((g) => g.metric && g.start == null);
  if (fresh.length) {
    const now = await currentGoalValues(userId, fresh);
    for (const g of fresh) g.start = now.get(g.id) ?? null;
  }
  await db.update(users).set({ profile }).where(eq(users.id, userId));
  return profile;
}
