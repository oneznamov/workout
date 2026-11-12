import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { aiNotes, users } from "@/db/schema";
import { extractJson, PLAN_SHAPE, planSchema, resolvePlan } from "./ai-plan";
import { AI_PROVIDERS, type AiNote, type AiProvider, type AiState } from "./ai-providers";
import { getMuscleSummary } from "./analytics";
import { seal, unseal } from "./crypto";
import { addDays, dayOf, TZ } from "./format";
import { normalizeGoals } from "./goals";
import { getMetricSeries } from "./health";
import { normalizeProfile, profileText } from "./profile";
import { addWorkoutExercise, createWorkout, getWorkout, lastPerformance, listExercises, listWorkoutsFull, type WorkoutFull } from "./workouts";

/** An error whose message is meant for the person using the app. */
export class AiError extends Error {}

type AiConfig = { provider: AiProvider; model: string; apiKey: string; auto: boolean };

// ───────────────────────── Connection ─────────────────────────

export async function getAiState(userId: string): Promise<AiState> {
  const [u] = await db.select({ ai: users.ai }).from(users).where(eq(users.id, userId));
  return u?.ai ? { provider: u.ai.provider, model: u.ai.model, hint: u.ai.hint, auto: u.ai.auto } : null;
}

async function getAiConfig(userId: string): Promise<AiConfig> {
  const [u] = await db.select({ ai: users.ai }).from(users).where(eq(users.id, userId));
  if (!u?.ai) throw new AiError("ШІ не підключено: додайте API-ключ у Налаштуваннях.");
  const apiKey = unseal(u.ai.key);
  if (!apiKey) throw new AiError("Збережений API-ключ не вдалося прочитати. Введіть його ще раз у Налаштуваннях.");
  return { provider: u.ai.provider, model: u.ai.model, apiKey, auto: u.ai.auto };
}

/** Saves the provider settings. An empty key keeps the one already stored. */
export async function saveAiSettings(userId: string, input: { provider: AiProvider; model: string; apiKey?: string; auto: boolean }) {
  const [u] = await db.select({ ai: users.ai }).from(users).where(eq(users.id, userId));
  const apiKey = input.apiKey?.trim();
  const sameProvider = u?.ai?.provider === input.provider;
  if (!apiKey && !sameProvider) throw new AiError("Введіть API-ключ для цього провайдера.");
  const model = input.model.trim().slice(0, 80) || AI_PROVIDERS[input.provider].model;
  await db
    .update(users)
    .set({
      ai: {
        provider: input.provider,
        model,
        key: apiKey ? seal(apiKey) : u!.ai!.key,
        hint: apiKey ? apiKey.slice(-4) : u!.ai!.hint,
        auto: input.auto,
      },
    })
    .where(eq(users.id, userId));
}

export async function removeAiSettings(userId: string) {
  await db.update(users).set({ ai: null }).where(eq(users.id, userId));
}

// ───────────────────────── Talking to a model ─────────────────────────

type Ask = { system: string; prompt: string };

/** Models that accept the server-side refusal fallback. */
const WITH_FALLBACK = new Set(["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-2", "claude-fable-5-1"]);
/** Older Claude models that do not take the `effort` setting. */
const NO_EFFORT = /claude-(3|haiku-4|sonnet-4-[0-5]|opus-4-[0-1])/;

async function askClaude(cfg: AiConfig, ask: Ask, schema?: z.ZodType): Promise<string> {
  const client = new Anthropic({ apiKey: cfg.apiKey, maxRetries: 1, timeout: 180_000 });
  const output_config = {
    ...(NO_EFFORT.test(cfg.model) ? {} : { effort: "medium" as const }),
    ...(schema ? { format: zodOutputFormat(schema) } : {}),
  };
  const params = {
    model: cfg.model,
    max_tokens: 16000,
    system: ask.system,
    messages: [{ role: "user" as const, content: ask.prompt }],
    ...(Object.keys(output_config).length ? { output_config } : {}),
  };
  try {
    let message: Anthropic.Message | Anthropic.Beta.BetaMessage;
    if (WITH_FALLBACK.has(cfg.model)) {
      try {
        // If the model declines a request, the API re-runs it on a fallback model inside the same call.
        message = await client.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
      } catch (e) {
        if (!(e instanceof Anthropic.BadRequestError)) throw e;
        message = await client.messages.create(params);
      }
    } else {
      message = await client.messages.create(params);
    }
    if (message.stop_reason === "refusal") throw new AiError("Модель відмовилась відповідати на цей запит.");
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    if (!text) throw new AiError(message.stop_reason === "max_tokens" ? "Відповідь моделі обірвалася. Спробуйте ще раз." : "Модель повернула порожню відповідь.");
    return text;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("API-ключ Claude не підходить. Перевірте його в Налаштуваннях.");
    if (e instanceof Anthropic.PermissionDeniedError) throw new AiError("Цей ключ не має доступу до вибраної моделі.");
    if (e instanceof Anthropic.NotFoundError) throw new AiError(`Модель «${cfg.model}» не знайдено. Перевірте назву в Налаштуваннях.`);
    if (e instanceof Anthropic.RateLimitError) throw new AiError("Перевищено ліміт запитів до Claude. Спробуйте за хвилину.");
    if (e instanceof Anthropic.BadRequestError) throw new AiError(`Claude відхилив запит: ${e.message.slice(0, 200)}`);
    if (e instanceof Anthropic.APIConnectionError) throw new AiError("Не вдалося зʼєднатися з Claude. Спробуйте ще раз.");
    if (e instanceof Anthropic.APIError) throw new AiError(`Помилка Claude (${e.status ?? "?"}). Спробуйте пізніше.`);
    throw e;
  }
}

const COMPAT_BASE: Record<Exclude<AiProvider, "anthropic">, string> = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
};

/** OpenAI, DeepSeek and Gemini all speak the chat-completions format. */
async function askCompatible(cfg: AiConfig, ask: Ask, json: boolean): Promise<string> {
  const label = AI_PROVIDERS[cfg.provider].label;
  let res: Response;
  try {
    res = await fetch(`${COMPAT_BASE[cfg.provider as Exclude<AiProvider, "anthropic">]}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: "system", content: ask.system },
          { role: "user", content: ask.prompt },
        ],
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(180_000),
    });
  } catch {
    throw new AiError(`Не вдалося зʼєднатися з ${label}. Спробуйте ще раз.`);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    if (res.status === 401 || res.status === 403) throw new AiError(`API-ключ ${label} не підходить або не має доступу. Перевірте його в Налаштуваннях.`);
    if (res.status === 404) throw new AiError(`Модель «${cfg.model}» не знайдено у ${label}. Перевірте назву в Налаштуваннях.`);
    if (res.status === 429) throw new AiError(`${label}: перевищено ліміт запитів або закінчився баланс.`);
    if (res.status === 402) throw new AiError(`${label}: недостатньо коштів на балансі.`);
    throw new AiError(`${label} відповів помилкою ${res.status}. ${detail}`);
  }
  const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string | null } }[] } | null;
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new AiError("Модель повернула порожню відповідь.");
  return text;
}

async function askText(cfg: AiConfig, ask: Ask) {
  return cfg.provider === "anthropic" ? askClaude(cfg, ask) : askCompatible(cfg, ask, false);
}

async function askJson(cfg: AiConfig, ask: Ask, schema: z.ZodType): Promise<unknown> {
  const text = cfg.provider === "anthropic" ? await askClaude(cfg, ask, schema) : await askCompatible(cfg, ask, true);
  try {
    return extractJson(text);
  } catch {
    throw new AiError("Модель відповіла не у форматі плану. Спробуйте ще раз.");
  }
}

/** One tiny request to check that the key and the model name work. */
export async function testAi(userId: string) {
  const cfg = await getAiConfig(userId);
  const reply = await askText(cfg, { system: "You are a connection check. Reply with one short friendly sentence in Ukrainian.", prompt: "Привіт! Перевірка звʼязку." });
  return { model: cfg.model, reply: reply.slice(0, 200) };
}

// ───────────────────────── What the model is told ─────────────────────────

const SYSTEM = `You are the training coach inside Workout, a personal gym-tracking app. The reader is the athlete, on their phone — usually right after a session or while deciding what to train next. Your text appears in a small card, so it has to be short, specific and built on their own numbers.

Write in Ukrainian and address the reader as «ви». Plain text only: short paragraphs, or lines starting with «•» — no markdown headings, bold or tables. Exercise names stay as they are in the data.

The athlete's private goals and notes are the frame for every judgement: say how the data moves them toward a goal or away from it, and respect any limitation they mention (injury, schedule, equipment). Use only what is in the context; when there is too little history to judge something, say so in a few words rather than guessing. You are not a doctor — for pain or injury suggest seeing a specialist instead of diagnosing.`;

type FullSet = WorkoutFull["exercises"][number]["sets"][number];
const setText = (s: Pick<FullSet, "weight" | "reps" | "durationSec" | "distanceM">) =>
  s.durationSec != null && s.reps == null
    ? `${s.durationSec}s`
    : s.distanceM != null && s.reps == null
      ? `${Math.round(s.distanceM)}m`
      : `${s.weight != null && s.weight > 0 ? `${s.weight}kg×` : ""}${s.reps ?? "?"}`;

function workoutText(w: WorkoutFull | Awaited<ReturnType<typeof listWorkoutsFull>>[number], completedOnly = true) {
  const minutes = w.startedAt && w.endedAt ? Math.round(Math.max(0, (w.endedAt.getTime() - w.startedAt.getTime()) / 1000 - w.pausedSec) / 60) : null;
  const head = `${w.startedAt ? dayOf(w.startedAt) : (w.scheduledFor ?? "no date")} · ${w.name}${minutes != null ? ` · ${minutes} min` : ""}`;
  const lines = w.exercises.map((e) => {
    const sets = e.sets.filter((s) => !completedOnly || s.completed);
    return `  ${e.exercise.name} [${e.exercise.muscle}]: ${sets.length ? sets.map(setText).join(", ") : "no sets"}${e.notes ? ` (note: ${e.notes})` : ""}`;
  });
  return [head, ...lines].join("\n");
}

/** Everything the coach should know about the athlete, as text. */
async function athleteContext(userId: string) {
  const today = dayOf();
  const [[u], recent, planned, muscles, weight] = await Promise.all([
    db.select({ profile: users.profile, goals: users.goals }).from(users).where(eq(users.id, userId)),
    listWorkoutsFull(userId, ["completed"], 10),
    listWorkoutsFull(userId, ["planned"], 6),
    getMuscleSummary(userId, 6),
    getMetricSeries(userId, ["body_mass"], addDays(today, -90)),
  ]);
  const targets = normalizeGoals(u?.goals);
  const history = [...recent].sort((a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0));
  const parts = [
    `Today: ${today} (${new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: TZ }).format(new Date())}).`,
    profileText(normalizeProfile(u?.profile)),
    `Weekly targets set in the app: ${targets.workouts} strength workouts, ${targets.cardioMin} min of cardio, ${targets.muscles} muscle groups trained enough.`,
    weight.length
      ? `Body weight: ${weight.at(-1)!.value} kg on ${weight.at(-1)!.day}${weight.length > 1 ? `; ${weight[0].value} kg on ${weight[0].day}` : ""}.`
      : "Body weight: not recorded.",
    `Muscle load this week vs the weekly average over 6 weeks (${muscles.counting})\n${muscles.muscles
      .map((m) => `  ${m.muscle}: ${m.load_this_week} this week, avg ${m.avg_load_per_week}, last trained ${m.last_trained ?? "never"}`)
      .join("\n")}`,
    `Cardio minutes by week, oldest first: ${muscles.cardio_minutes_by_week.join(", ")}.`,
    history.length ? `Finished workouts, newest first:\n${history.map((w) => workoutText(w)).join("\n")}` : "Finished workouts: none yet.",
    planned.length ? `Already planned:\n${planned.map((w) => workoutText(w, false)).join("\n")}` : "Already planned: nothing.",
  ];
  return parts.join("\n\n");
}

// ───────────────────────── Notes ─────────────────────────

async function readNote(userId: string, kind: "workout" | "coach", ref: string): Promise<AiNote | null> {
  const [n] = await db
    .select({ content: aiNotes.content, model: aiNotes.model, createdAt: aiNotes.createdAt })
    .from(aiNotes)
    .where(and(eq(aiNotes.userId, userId), eq(aiNotes.kind, kind), eq(aiNotes.ref, ref)));
  return n ? { content: n.content, model: n.model, createdAt: n.createdAt.toISOString() } : null;
}

async function writeNote(userId: string, kind: "workout" | "coach", ref: string, content: string, model: string): Promise<AiNote> {
  const createdAt = new Date();
  await db
    .insert(aiNotes)
    .values({ userId, kind, ref, content, model, createdAt })
    .onConflictDoUpdate({ target: [aiNotes.userId, aiNotes.kind, aiNotes.ref], set: { content, model, createdAt } });
  return { content, model, createdAt: createdAt.toISOString() };
}

export const getWorkoutNote = (userId: string, workoutId: string) => readNote(userId, "workout", workoutId);
export const getCoachNote = (userId: string) => readNote(userId, "coach", dayOf());

/** A short review of one finished workout: progress against last time, what to watch, what to do next. */
export async function analyzeWorkout(userId: string, workoutId: string, force = false): Promise<AiNote> {
  if (!force) {
    const saved = await readNote(userId, "workout", workoutId);
    if (saved) return saved;
  }
  const cfg = await getAiConfig(userId);
  const w = await getWorkout(userId, workoutId);
  if (w.status !== "completed") throw new AiError("Аналіз доступний після завершення тренування.");
  const [context, last] = await Promise.all([
    athleteContext(userId),
    lastPerformance(
      userId,
      w.exercises.map((e) => e.exercise.id),
      w.id,
    ),
  ]);
  const previous = w.exercises
    .map((e) => {
      const p = last[e.exercise.id];
      return p?.sets.length ? `  ${e.exercise.name}: ${p.sets.map(setText).join(", ")}${p.date ? ` (${dayOf(p.date)})` : ""}` : `  ${e.exercise.name}: first time`;
    })
    .join("\n");
  const watch = w.healthWorkouts
    .map((h) => `  ${h.activityType}: avg HR ${h.avgHr ? Math.round(h.avgHr) : "?"}, max HR ${h.maxHr ? Math.round(h.maxHr) : "?"}, ${h.activeKcal ? Math.round(h.activeKcal) : "?"} active kcal`)
    .join("\n");
  const prompt = `${context}

The workout to review:
${workoutText(w)}${w.notes ? `\n  Athlete's note: ${w.notes}` : ""}

The same exercises the previous time they were done:
${previous}

Apple Watch data for this workout:
${watch || "  none"}

Write the review the athlete reads right after finishing this workout, about 90–140 words: what improved or slipped compared with last time (name the exercises and numbers), anything worth watching, and one concrete suggestion for the next session.`;
  return writeNote(userId, "workout", workoutId, await askText(cfg, { system: SYSTEM, prompt }), cfg.model);
}

/** Today's coaching note: how the week is going and what to train next. One per day unless refreshed. */
export async function coachNote(userId: string, force = false): Promise<AiNote> {
  if (!force) {
    const saved = await getCoachNote(userId);
    if (saved) return saved;
  }
  const cfg = await getAiConfig(userId);
  const prompt = `${await athleteContext(userId)}

Write today's coaching note for the home screen, about 80–130 words: how this week is going against the weekly targets and the athlete's goals, which muscle groups are falling behind, and what to do in the next session (name a few exercises). If a goal looks unrealistic or already reached given the data, say so and suggest how to adjust it.`;
  return writeNote(userId, "coach", dayOf(), await askText(cfg, { system: SYSTEM, prompt }), cfg.model);
}

// ───────────────────────── Planning ─────────────────────────

const PLAN_SYSTEM = `You plan strength workouts inside Workout, a personal gym-tracking app. The plan is saved straight into the athlete's diary as a planned workout they will follow in the gym, so it must be something they can actually do: exercises only from the app's library (use the exact English name), realistic weights based on their recent sets (a small step up where they have been progressing, the same or less where they struggled), and a session length that matches how long they usually train.

Respect the athlete's goals, limitations and wishes above everything else. Prefer muscle groups that are behind this week and avoid ones trained hard in the last two days. For exercises they have never done, leave weight as null so they pick it themselves. Timed exercises (plank and the like) take duration_sec instead of reps.

Reply with a single JSON object and nothing else, in this shape:
${PLAN_SHAPE}`;

async function libraryText(userId: string) {
  const library = await listExercises(userId);
  return { library, text: library.map((e) => `${e.name} [${e.muscle}, ${e.equipment}, ${e.tracking}]`).join("\n") };
}

/** Asks the model for a workout and saves it as planned. Returns the new workout id. */
export async function planWorkout(userId: string, input: { wish?: string; date?: string }) {
  const cfg = await getAiConfig(userId);
  const [context, lib] = await Promise.all([athleteContext(userId), libraryText(userId)]);
  const date = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : dayOf();
  const prompt = `${context}

Exercise library — name [muscle, equipment, tracking]:
${lib.text}

Plan one workout for ${date}.${input.wish?.trim() ? `\nThe athlete's wish for this session: ${input.wish.trim().slice(0, 500)}` : ""}`;
  const plan = resolvePlan(await askJson(cfg, { system: PLAN_SYSTEM, prompt }, planSchema), lib.library);
  if (plan.exercises.length === 0) throw new AiError("Модель не запропонувала жодної вправи з бібліотеки. Спробуйте ще раз.");
  const id = await createWorkout(userId, { name: plan.name, status: "planned", scheduledFor: date, notes: plan.notes || null, exercises: plan.exercises });
  return { id, exercises: plan.exercises.length };
}

/** Asks the model what an existing plan is missing and appends those exercises. */
export async function supplementWorkout(userId: string, workoutId: string) {
  const cfg = await getAiConfig(userId);
  const w = await getWorkout(userId, workoutId);
  if (w.status === "completed") throw new AiError("Доповнити можна заплановане тренування, шаблон або те, що триває.");
  const [context, lib] = await Promise.all([athleteContext(userId), libraryText(userId)]);
  const prompt = `${context}

Exercise library — name [muscle, equipment, tracking]:
${lib.text}

The athlete already has this workout and wants it completed, not replaced:
${workoutText(w, false)}

Return only the exercises to ADD (usually one to three; none if the workout is already complete): what is missing for balance and for the athlete's goals, given what the workout already covers. Keep "name" as "${w.name}" and use "notes" to say in one sentence why you added them.`;
  const plan = resolvePlan(
    await askJson(cfg, { system: PLAN_SYSTEM, prompt }, planSchema),
    lib.library,
    w.exercises.map((e) => e.exercise.id),
  );
  for (const item of plan.exercises.slice(0, 4)) await addWorkoutExercise(userId, workoutId, item);
  return { added: Math.min(4, plan.exercises.length), why: plan.notes };
}
