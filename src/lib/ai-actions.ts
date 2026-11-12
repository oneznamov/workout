"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { AiError, analyzeWorkout, coachNote, planWorkout, removeAiSettings, saveAiSettings, supplementWorkout, testAi } from "./ai";
import { AI_PROVIDER_IDS, type AiNote, type AiResult } from "./ai-providers";
import { requireUserId } from "./auth";
import { logError } from "./errors";
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

export async function supplementWorkoutAction(workoutId: string) {
  return attempt("supplement", (userId) => supplementWorkout(userId, workoutId));
}

/** Private goals and notes about the athlete. */
export async function saveProfileAction(input: Profile): Promise<Profile> {
  const userId = await requireUserId();
  const profile = normalizeProfile(input);
  await db.update(users).set({ profile }).where(eq(users.id, userId));
  return profile;
}
