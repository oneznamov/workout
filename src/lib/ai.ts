import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { and, desc, eq, gte, notInArray } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { aiNotes, users, workouts as workoutsTable } from "@/db/schema";
import { extractJson, PLAN_SHAPE, planSchema, PROGRAM_SHAPE, programSchema, resolvePlan, resolveProgram } from "./ai-plan";
import { AI_PROVIDERS, type AiNote, type AiProvider, type AiState } from "./ai-providers";
import { getMuscleSummary, getRecords, getTrainingAnalytics } from "./analytics";
import { seal, unseal } from "./crypto";
import { addDays, dayOf, TZ } from "./format";
import { normalizeGoals } from "./goals";
import { getMetricSeries, linkHealthWorkouts, listHealthWorkouts } from "./health";
import { normalizeProfile, profileText } from "./profile";
import { toClientWorkout } from "./shape";
import { buildTimeline } from "./timeline";
import {
  addWorkoutExercise,
  createWorkout,
  getWorkout,
  lastPerformance,
  listExercises,
  listWorkoutsFull,
  replaceWorkoutPlan,
  updateWorkout,
  type WorkoutFull,
} from "./workouts";

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

const VITALS: [string, string, string][] = [
  ["body_fat_percentage", "Body fat", "%"],
  ["resting_heart_rate", "Resting heart rate", "bpm"],
  ["heart_rate_variability", "HRV", "ms"],
  ["sleep_analysis", "Sleep", "h"],
  ["vo2_max", "VO2 max", ""],
  ["step_count", "Steps per day", ""],
];
const round1 = (n: number) => Math.round(n * 10) / 10;

/** One line per Apple Watch session — the diary knows nothing else about yoga, climbing, runs and the like. */
const watchLine = (h: Awaited<ReturnType<typeof listHealthWorkouts>>[number]) =>
  `  ${dayOf(h.startAt)} ${h.activityType}, ${Math.round((h.durationSec ?? 0) / 60)} min` +
  `${h.avgHr ? `, avg HR ${Math.round(h.avgHr)}` : ""}${h.maxHr ? `, max HR ${Math.round(h.maxHr)}` : ""}` +
  `${h.activeKcal ? `, ${Math.round(h.activeKcal)} kcal` : ""}${h.distanceM ? `, ${round1(h.distanceM / 1000)} km` : ""}` +
  `${h.workoutId ? " [attached to a diary workout]" : " [no diary entry]"}`;

/**
 * Everything the coach should know about the athlete, as text: goals and notes, body and
 * recovery metrics, muscle load, records, recent diary workouts and Apple Watch sessions.
 * Every AI feature starts from this, so none of them can forget the goals or the history.
 */
async function athleteContext(userId: string, historyLimit = 12) {
  const today = dayOf();
  const [[u], recent, planned, muscles, weight, vitals, watch, records] = await Promise.all([
    db.select({ profile: users.profile, goals: users.goals }).from(users).where(eq(users.id, userId)),
    listWorkoutsFull(userId, ["completed"], historyLimit),
    listWorkoutsFull(userId, ["planned"], 10),
    getMuscleSummary(userId, 6),
    getMetricSeries(userId, ["body_mass"], addDays(today, -90)),
    getMetricSeries(
      userId,
      VITALS.map(([m]) => m),
      addDays(today, -28),
    ),
    listHealthWorkouts(userId, { from: addDays(today, -21), limit: 30 }),
    getRecords(userId, addDays(today, -30), 8),
  ]);
  const targets = normalizeGoals(u?.goals);
  const history = [...recent].sort((a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0));
  const vitalLines = VITALS.flatMap(([metric, label, unit]) => {
    const rows = vitals.filter((v) => v.metric === metric);
    if (rows.length === 0) return [];
    const avg = rows.reduce((a, r) => a + r.value, 0) / rows.length;
    return [`  ${label}: latest ${round1(rows.at(-1)!.value)}${unit ? ` ${unit}` : ""} (${rows.at(-1)!.day}), 4-week average ${round1(avg)}`];
  });
  const parts = [
    `Today: ${today} (${new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: TZ }).format(new Date())}).`,
    profileText(normalizeProfile(u?.profile)),
    `Weekly targets set in the app: ${targets.workouts} strength workouts, ${targets.cardioMin} min of cardio, ${targets.muscles} muscle groups trained enough.`,
    weight.length
      ? `Body weight: ${weight.at(-1)!.value} kg on ${weight.at(-1)!.day}${weight.length > 1 ? `; ${weight[0].value} kg on ${weight[0].day} (${weight.length} entries in 90 days)` : ""}.`
      : "Body weight: not recorded.",
    vitalLines.length ? `Body and recovery metrics from Apple Health:\n${vitalLines.join("\n")}` : "Body and recovery metrics from Apple Health: none synced.",
    `Muscle load this week vs the weekly average over 6 weeks (${muscles.counting})\n${muscles.muscles
      .map((m) => `  ${m.muscle}: ${m.load_this_week} this week, avg ${m.avg_load_per_week}, last trained ${m.last_trained ?? "never"}`)
      .join("\n")}`,
    `Cardio minutes by week, oldest first: ${muscles.cardio_minutes_by_week.join(", ")}.`,
    records.length
      ? `Best sets by estimated 1RM:\n${records.map((r) => `  ${r.name}: ${r.weight}kg×${r.reps} on ${r.day}${r.isNew ? " (new record in the last 30 days)" : ""}`).join("\n")}`
      : "Best sets: not enough data yet.",
    history.length ? `Finished diary workouts, newest first:\n${history.map((w) => workoutText(w)).join("\n")}` : "Finished diary workouts: none yet.",
    watch.length
      ? `Apple Watch sessions in the last 3 weeks, newest first (every activity, including ones the diary does not track):\n${watch.map(watchLine).join("\n")}`
      : "Apple Watch sessions in the last 3 weeks: none synced.",
    planned.length ? `Already planned:\n${planned.map((w) => workoutText(w, false)).join("\n")}` : "Already planned: nothing.",
  ];
  return parts.join("\n\n");
}

/** What happened minute by minute, as text: rest before each set, peak heart rate, time in zones. */
function timelineText(w: WorkoutFull) {
  const t = buildTimeline(toClientWorkout(w));
  if (!t) return "  not available (no set times and no heart-rate data)";
  const fmt = (sec: number | null) => (sec == null ? "?" : `${Math.round(sec)}s`);
  return [
    `  Source: ${t.mode === "logged" ? "set times recorded live" : `estimated from the heart-rate curve (confidence ${t.confidence})`}.`,
    `  Work ${Math.round(t.workSec / 60)} min, rest ${Math.round(t.restSec / 60)} min, average rest ${fmt(t.avgRestSec)}.`,
    `  Average rest by exercise: ${t.byExercise.map((e) => `${e.exercise} ${fmt(e.avgRestSec)}`).join("; ")}.`,
    `  Sets in order (rest before / peak HR): ${t.sets.map((x) => `${x.exercise} #${x.index} ${x.label} (${fmt(x.restBeforeSec)} / ${x.peakHr ?? "?"})`).join("; ")}.`,
    t.zones ? `  Time in heart-rate zones: ${t.zones.map((z) => `${z.label} ${Math.round(z.sec / 60)} min`).join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ───────────────────────── Notes ─────────────────────────

type NoteKind = "workout" | "coach" | "report";

async function readNote(userId: string, kind: NoteKind, ref: string): Promise<AiNote | null> {
  const [n] = await db
    .select({ content: aiNotes.content, model: aiNotes.model, createdAt: aiNotes.createdAt })
    .from(aiNotes)
    .where(and(eq(aiNotes.userId, userId), eq(aiNotes.kind, kind), eq(aiNotes.ref, ref)));
  return n ? { content: n.content, model: n.model, createdAt: n.createdAt.toISOString() } : null;
}

async function writeNote(userId: string, kind: NoteKind, ref: string, content: string, model: string): Promise<AiNote> {
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
  // Attach the Apple Watch record first if it arrived after the workout was finished.
  await linkHealthWorkouts(userId).catch(() => undefined);
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
${watch || "  none — no watch session overlaps this workout"}

Timeline of this workout:
${timelineText(w)}

Write the review the athlete reads right after finishing this workout, about 110–160 words: what improved or slipped compared with last time (name the exercises and numbers), what the heart rate and rest times say about effort and pacing when that data exists, anything worth watching, and one concrete suggestion for the next session.`;
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

const PROGRAM_SYSTEM = `${PLAN_SYSTEM.slice(0, PLAN_SYSTEM.indexOf("Reply with a single JSON object"))}You are planning several sessions at once, so think of them as one programme: spread the muscle groups so each gets enough work across the days and none is trained hard on two days in a row, vary the sessions instead of repeating one workout, and count what the athlete does outside the gym (Apple Watch sessions, things they mention in their wish) as load that needs recovery. Give each workout a short distinct name.

Reply with a single JSON object and nothing else, in this shape:
${PROGRAM_SHAPE}

where every item of "exercises" looks like this:
${PLAN_SHAPE.slice(PLAN_SHAPE.indexOf('"exercises": [{') + '"exercises": ['.length, PLAN_SHAPE.lastIndexOf("]"))}`;

/**
 * Plans several workouts at once and saves them as planned: either on the days the athlete
 * picked, or `count` sessions the model spreads over the week starting at `from`.
 */
export async function planProgram(userId: string, input: { wish?: string; days?: string[]; count?: number; from?: string }) {
  const cfg = await getAiConfig(userId);
  const isDay = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const today = dayOf();
  const picked = [...new Set((input.days ?? []).filter(isDay))].filter((d) => d >= today).sort().slice(0, 7);
  const from = isDay(input.from) && input.from >= today ? input.from : today;
  const week = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const count = Math.min(6, Math.max(2, Math.round(input.count ?? 3)));
  const allowed = picked.length ? picked : week;
  const [context, lib] = await Promise.all([athleteContext(userId), libraryText(userId)]);
  const task = picked.length
    ? `Plan one workout for each of these days: ${picked.join(", ")}.`
    : `Plan ${count} workouts in the week ${week[0]} … ${week[6]}. Choose the days yourself, leaving recovery between hard sessions and avoiding days that already have a planned workout or a demanding activity.`;
  const prompt = `${context}

Exercise library — name [muscle, equipment, tracking]:
${lib.text}

${task}${input.wish?.trim() ? `\nThe athlete's wishes for this programme: ${input.wish.trim().slice(0, 800)}` : ""}`;
  const program = resolveProgram(await askJson(cfg, { system: PROGRAM_SYSTEM, prompt }, programSchema), lib.library, allowed);
  if (program.workouts.length === 0) throw new AiError("Модель не запропонувала жодного тренування з вправами з бібліотеки. Спробуйте ще раз.");
  const created: { id: string; name: string; date: string }[] = [];
  for (const w of program.workouts) {
    const id = await createWorkout(userId, { name: w.name, status: "planned", scheduledFor: w.date, notes: w.notes || null, exercises: w.exercises });
    created.push({ id, name: w.name, date: w.date });
  }
  return { created, why: program.notes };
}

/**
 * Rebuilds a workout that is already planned, following what the athlete says has changed
 * ("yoga and bouldering tomorrow", "only 30 minutes", "shoulder hurts").
 */
export async function reviseWorkout(userId: string, workoutId: string, instruction: string) {
  const cfg = await getAiConfig(userId);
  const w = await getWorkout(userId, workoutId);
  if (w.status !== "planned" && w.status !== "template") throw new AiError("Перезібрати можна заплановане тренування або шаблон.");
  const [context, lib] = await Promise.all([athleteContext(userId), libraryText(userId)]);
  const what = instruction.trim().slice(0, 800);
  const prompt = `${context}

Exercise library — name [muscle, equipment, tracking]:
${lib.text}

The athlete already has this workout${w.scheduledFor ? ` planned for ${w.scheduledFor}` : ""} and wants it rebuilt:
${workoutText(w, false)}${w.notes ? `\n  Note on the workout: ${w.notes}` : ""}

${what ? `What has changed, in the athlete's words: ${what}` : "Nothing specific has changed — check it against the athlete's goals, recent load and recovery, and improve it."}

Return the whole updated workout (every exercise it should now contain, not only the changes). Keep what still makes sense, drop or swap what conflicts with the new situation, and adjust sets and weights where needed. In "notes" say in one or two sentences what you changed and why.`;
  const plan = resolvePlan(await askJson(cfg, { system: PLAN_SYSTEM, prompt }, planSchema), lib.library);
  if (plan.exercises.length === 0) throw new AiError("Модель не запропонувала жодної вправи з бібліотеки. Спробуйте ще раз.");
  await replaceWorkoutPlan(userId, workoutId, plan.exercises);
  await updateWorkout(userId, workoutId, { name: plan.name, notes: plan.notes || null });
  return { exercises: plan.exercises.length, why: plan.notes };
}

// ───────────────────────── Looking back ─────────────────────────

const REPORT_WEEKS = [4, 8, 12, 26, 52];
const reportRef = (weeks: number) => `${weeks}w`;

export const getPeriodReport = (userId: string, weeks: number) => readNote(userId, "report", reportRef(weeks));

/** A written report on a period: progress, load balance, heart and recovery, where it stands against the goals. */
export async function periodReport(userId: string, weeks: number, force = false): Promise<AiNote> {
  const span = REPORT_WEEKS.includes(weeks) ? weeks : 12;
  if (!force) {
    const saved = await getPeriodReport(userId, span);
    if (saved) return saved;
  }
  const cfg = await getAiConfig(userId);
  await linkHealthWorkouts(userId).catch(() => undefined);
  const [context, stats] = await Promise.all([athleteContext(userId, 40), getTrainingAnalytics(userId, span)]);
  const weekly = stats.weekly.map((w) => `  ${w.week}: ${w.workouts} workouts, ${w.durationMin} min, ${w.sets} sets, ${Math.round(w.volume)} kg`).join("\n");
  const prompt = `${context}

Strength training week by week over the last ${span} weeks (week starting on):
${weekly}

Write a report on these ${span} weeks, about 220–320 words, as short paragraphs each starting with a two- or three-word label and a colon (no markdown): the overall picture; progress in specific exercises with numbers; how the load is spread across muscle groups and what is neglected; what the Apple Watch data says about heart rate, effort and recovery (and mention watch sessions that have no diary entry, or diary workouts without watch data, if that limits the analysis); where the athlete stands against each of their goals; and three concrete changes for the coming weeks.`;
  return writeNote(userId, "report", reportRef(span), await askText(cfg, { system: SYSTEM, prompt }), cfg.model);
}

/**
 * Finished workouts from the last two months that have no AI review yet, newest first.
 * Watch records are matched to diary workouts first, so the reviews can use them.
 */
export async function listUnreviewed(userId: string, limit = 10) {
  await linkHealthWorkouts(userId).catch(() => undefined);
  const reviewed = await db.select({ ref: aiNotes.ref }).from(aiNotes).where(and(eq(aiNotes.userId, userId), eq(aiNotes.kind, "workout")));
  const where = [eq(workoutsTable.userId, userId), eq(workoutsTable.status, "completed"), gte(workoutsTable.startedAt, new Date(Date.now() - 60 * 86400000))];
  if (reviewed.length) where.push(notInArray(workoutsTable.id, reviewed.map((r) => r.ref)));
  return db
    .select({ id: workoutsTable.id, name: workoutsTable.name })
    .from(workoutsTable)
    .where(and(...where))
    .orderBy(desc(workoutsTable.startedAt))
    .limit(limit);
}
