import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { and, desc, eq, gte, notInArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { aiNotes, users, workouts as workoutsTable } from "@/db/schema";
import { extractJson, PLAN_SHAPE, planSchema, PROGRAM_MAX_WORKOUTS, PROGRAM_SHAPE, programSchema, resolvePlan, resolveProgram } from "./ai-plan";
import { AI_PROVIDERS, type AiNote, type AiProvider, type AiState } from "./ai-providers";
import { getAthleteContext, setText } from "./athlete-context";
import { getTrainingAnalytics } from "./analytics";
import { featureOn } from "./config";
import { seal, unseal } from "./crypto";
import { logError } from "./errors";
import { addDays, dayOf } from "./format";
import { normalizeGoals } from "./goals";
import { linkHealthWorkouts } from "./health";
import { addRevision, clearUpcoming, createProgram, getProgram, listPrograms, programText, updateProgram } from "./programs";
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
  if (!featureOn("ai")) return null;
  const [u] = await db.select({ ai: users.ai }).from(users).where(eq(users.id, userId));
  return u?.ai ? { provider: u.ai.provider, model: u.ai.model, hint: u.ai.hint, auto: u.ai.auto } : null;
}

async function getAiConfig(userId: string): Promise<AiConfig> {
  if (!featureOn("ai")) throw new AiError("ШІ вимкнено в налаштуваннях застосунку.");
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

/** `maxTokens` — room for the answer; a programme of many workouts needs more than a single one. */
type Ask = { system: string; prompt: string; maxTokens?: number };
/** A whole programme: up to twenty workouts in one answer. */
const PROGRAM_TOKENS = 32000;
/** Stop a little before the platform would cut the request off, so the athlete gets a plain message instead. */
const AI_TIME_LIMIT_MS = 280_000;
const TOO_LONG = "План вийшов завеликим і не вмістився в одну відповідь. Попросіть менше за раз — наприклад, два тижні замість чотирьох.";

/** Models that accept the server-side refusal fallback. */
const WITH_FALLBACK = new Set(["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-2", "claude-fable-5-1"]);
/** Older Claude models that do not take the `effort` setting. */
const NO_EFFORT = /claude-(3|haiku-4|sonnet-4-[0-5]|opus-4-[0-1])/;

async function askClaude(cfg: AiConfig, ask: Ask, schema?: z.ZodType): Promise<string> {
  const client = new Anthropic({ apiKey: cfg.apiKey, maxRetries: 1, timeout: AI_TIME_LIMIT_MS });
  // Streamed, so a long answer is not dropped as an idle connection; one deadline for the whole exchange.
  const options = { signal: AbortSignal.timeout(AI_TIME_LIMIT_MS) };
  const output_config = {
    ...(NO_EFFORT.test(cfg.model) ? {} : { effort: "medium" as const }),
    ...(schema ? { format: zodOutputFormat(schema) } : {}),
  };
  const params = {
    model: cfg.model,
    max_tokens: ask.maxTokens ?? 16000,
    system: ask.system,
    messages: [{ role: "user" as const, content: ask.prompt }],
    ...(Object.keys(output_config).length ? { output_config } : {}),
  };
  try {
    let message: Anthropic.Message | Anthropic.Beta.BetaMessage;
    if (WITH_FALLBACK.has(cfg.model)) {
      try {
        // If the model declines a request, the API re-runs it on a fallback model inside the same call.
        message = await client.beta.messages.stream({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }, options).finalMessage();
      } catch (e) {
        if (!(e instanceof Anthropic.BadRequestError)) throw e;
        message = await client.messages.stream(params, options).finalMessage();
      }
    } else {
      message = await client.messages.stream(params, options).finalMessage();
    }
    if (message.stop_reason === "refusal") throw new AiError("Модель відмовилась відповідати на цей запит.");
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    // A structured answer cut off half-way cannot be read at all — say what happened instead of "wrong format".
    if (message.stop_reason === "max_tokens" && (schema || !text)) throw new AiError(schema ? TOO_LONG : "Відповідь моделі обірвалася. Спробуйте ще раз.");
    if (!text) throw new AiError("Модель повернула порожню відповідь.");
    return text;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.APIUserAbortError || e instanceof Anthropic.APIConnectionTimeoutError || (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")))
      throw new AiError("ШІ відповідав надто довго, і запит зупинено. Спробуйте ще раз або попросіть менше за раз.");
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
      signal: AbortSignal.timeout(AI_TIME_LIMIT_MS),
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
  const data = (await res.json().catch(() => null)) as { choices?: { finish_reason?: string | null; message?: { content?: string | null } }[] } | null;
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (json && data?.choices?.[0]?.finish_reason === "length") throw new AiError(TOO_LONG);
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
    // Kept for diagnosis: which model, how long the reply was and how it ended.
    await logError({ source: "server", message: `AI reply is not JSON (${cfg.provider}/${cfg.model})`, detail: `length ${text.length}; ends with: ${text.slice(-300)}` });
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

The athlete's private goals and notes are the frame for every judgement: say how the data moves them toward a goal or away from it, and respect any limitation they mention (injury, schedule, equipment). Use only what is in the context; when there is too little history to judge something, say so in a few words rather than guessing. A planned workout may carry the effort its planner expected ("planned as N/10" or expected_effort_1_to_10); when the athlete's own rating of the finished session is far from it, the plan misjudged them — say so and adjust what comes next. A finished workout may carry the athlete's own effort rating ("felt N/10" or effort_1_to_10: 1–3 easy, 4–6 moderate, 7–8 hard, 9–10 all out). Set it against the numbers: high effort with flat or falling results points to fatigue or too much load, low effort with every set done means there is room to add; several hard sessions in a row call for an easier one. A finished workout may also carry the athlete's mood in a word and their own short note about it (mood, athlete_note). These are first-hand: a note about pain, poor sleep, low energy or a great day outweighs what the numbers alone suggest — use it in the review and in what you plan next, and never contradict it. Sleep steers the load: read recovery.today and recovery.sleep_by_night_hours before planning, changing or reviewing anything. The night is a reason to fit the session to the athlete's state, not a rule to cut it: judge it together with recent load, the effort ratings and what the session is for, and change only what the state calls for. As a guide: after a short night (level "short") one or two of the hardest sets usually go, weights drop 5–15% and nothing goes to failure; after a bad one (level "poor") or several short nights in a row the session becomes short and easy, or the hard work moves to another day; after good sleep (level "rested"), when recent sessions were coped with, there is room to add a little weight or a set; and when the plan already fits, leave it as it is and say so. When reviewing a finished workout, set its result against the night before it. Whenever sleep changed what you planned or advised, say so in one plain sentence with the hours. You are not a doctor — for pain or injury suggest seeing a specialist instead of diagnosing. When the context says training is on pause (health.paused_now), never press about missed sessions or weekly targets, and let the reason set the tone: illness — rest first, then an easy return at lower weights; injury — keep load off the injured area and suggest what can still be trained; period — lighter work by how they feel is fine, heavy sessions can wait, no fuss about it; mental (fatigue, stress) — fewer and easier sessions, sleep and walks count, nothing that adds pressure; travel — short bodyweight or hotel-gym options if they want them. Pauses that ended recently (health.recent_pauses) explain dips in the numbers and call for a gradual return rather than picking up where the plan left off.`;

function workoutText(w: WorkoutFull | Awaited<ReturnType<typeof listWorkoutsFull>>[number], completedOnly = true) {
  const minutes = w.startedAt && w.endedAt ? Math.round(Math.max(0, (w.endedAt.getTime() - w.startedAt.getTime()) / 1000 - w.pausedSec) / 60) : null;
  const head = `${w.startedAt ? dayOf(w.startedAt) : (w.scheduledFor ?? "no date")} · ${w.name}${minutes != null ? ` · ${minutes} min` : ""}${w.effort != null ? ` · felt ${w.effort}/10` : ""}${w.expectedEffort != null ? ` · planned as ${w.expectedEffort}/10` : ""}`;
  const lines = w.exercises.map((e) => {
    const sets = e.sets.filter((s) => !completedOnly || s.completed);
    return `  ${e.exercise.name} [${e.exercise.muscle}]: ${sets.length ? sets.map(setText).join(", ") : "no sets"}${e.notes ? ` (note: ${e.notes})` : ""}`;
  });
  return [head, ...lines].join("\n");
}

/**
 * Everything the coach should know about the athlete. Every AI feature starts from the same
 * document (see athlete-context.ts), so none of them can forget the goals, the body or the history.
 */
async function athleteContext(userId: string, historyLimit = 12) {
  const context = await getAthleteContext(userId, { history: historyLimit });
  return `Everything the app knows about the athlete, as JSON (${context.units}):\n${JSON.stringify(context, null, 1)}`;
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

/** The note written for the last data export, if there is one. */
export const getExportInsight = (userId: string) => readNote(userId, "report", "export");

/**
 * A short piece that travels with a data export: where the athlete stands, and how and why
 * the AI built the plans and programmes in it — so the reasoning is not lost with the app.
 */
export async function exportInsight(userId: string): Promise<AiNote> {
  const cfg = await getAiConfig(userId);
  const [context, all, planned] = await Promise.all([athleteContext(userId), listPrograms(userId), listWorkoutsFull(userId, ["planned"], 12)]);
  const recent = all.slice(-3);
  const programmes = await Promise.all(recent.map((p) => programText(userId, p.id)));
  const prompt = `${context}

Programmes (the newest last):
${programmes.join("\n\n") || "none yet"}

Planned workouts with the notes written when they were planned:
${planned.map((w) => `${workoutText(w, false)}${w.notes ? `\n  Why (note from planning): ${w.notes}` : ""}`).join("\n") || "none"}

The athlete is exporting their data and wants your reasoning to go with it. Write 200–280 words in two parts, each starting with its label and a colon (no markdown).
«Аналіз:» — where the athlete stands now: what is progressing, what lags behind, what recovery, effort ratings and pauses say.
«Як приймались рішення:» — how and why the plans and programmes above are built the way they are: which facts in the data (goals, recent sets and weights, effort ratings, muscle load, pauses, Apple Watch sessions, the athlete's own wishes) led to the choice of exercises, weights, number of sessions a week and progression. Give two or three concrete examples with numbers. If nothing has been planned yet, say what a plan would be based on.`;
  return writeNote(userId, "report", "export", await askText(cfg, { system: SYSTEM, prompt }), cfg.model);
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

const PROGRAM_SYSTEM = `${PLAN_SYSTEM.slice(0, PLAN_SYSTEM.indexOf("Reply with a single JSON object"))}You may be planning one session or several. When there are several, think of them as one programme: spread the muscle groups so each gets enough work across the days and none is trained hard on two days in a row, vary the sessions instead of repeating one workout, build in progression from week to week (a little more weight or volume where the athlete has been coping, a lighter week after three hard ones in a long programme), and count what the athlete does outside the gym (Apple Watch sessions, things they mention in their wish) as load that needs recovery. Give each workout a short distinct name.

Reply with a single JSON object and nothing else, in this shape:
${PROGRAM_SHAPE}

where every item of "exercises" looks like this:
${PLAN_SHAPE.slice(PLAN_SHAPE.indexOf('"exercises": [{') + '"exercises": ['.length, PLAN_SHAPE.lastIndexOf("]"))}`;

/**
 * Plans one or several workouts from a free-form request and saves them as planned.
 * Days can be ticked in the calendar; when none are, the model works out from the words
 * ("three this week", "tomorrow legs", "Mon, Wed, Fri") how many and when — and plans a
 * single workout for today when the request says nothing about days.
 */
export type ProgramFrame = { name: string; description: string; forecast: string; startsOn: string; endsOn: string };

export async function planProgram(userId: string, input: { wish?: string; days?: string[]; program?: ProgramFrame }) {
  const cfg = await getAiConfig(userId);
  const isDay = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const today = dayOf();
  const picked = [...new Set((input.days ?? []).filter(isDay))].filter((d) => d >= today).sort().slice(0, PROGRAM_MAX_WORKOUTS);
  // A programme the athlete has framed by hand (name, dates, purpose): the model fills it with workouts.
  const frame = input.program && isDay(input.program.startsOn) && isDay(input.program.endsOn) ? input.program : null;
  const horizon = Array.from({ length: 49 }, (_, i) => addDays(today, i)).filter((d) => !frame || (d >= frame.startsOn && d <= frame.endsOn));
  if (frame && horizon.length === 0) throw new AiError("Програма має починатися не пізніше ніж за сім тижнів і закінчуватися не раніше ніж сьогодні.");
  const allowed = picked.length ? picked : horizon;
  const [context, lib] = await Promise.all([athleteContext(userId), libraryText(userId)]);
  const wish = input.wish?.trim().slice(0, 800);
  const task = frame
    ? `The athlete is setting up a training programme and asks you to fill it with workouts.
Name: "${frame.name}". It runs from ${frame.startsOn} to ${frame.endsOn}; plan workouts on dates from ${horizon[0]} to ${horizon.at(-1)} (at most ${PROGRAM_MAX_WORKOUTS}).
Purpose, in their words: ${frame.description.trim() || "not written down — work it out from their goals"}.
Expected result, in their words: ${frame.forecast.trim() || "not written down — state a realistic one in \"forecast\""}.
Decide how many sessions a week fit their experience, goals and schedule (usually two to four), keep the same weekdays from week to week, and build progression across the weeks. Keep the programme's name as given.`
    : picked.length
    ? `Plan one workout for each of these days: ${picked.join(", ")}.`
    : `The athlete did not tick any days. Work out from their request how many workouts they want and on which dates — any day from ${today} to ${horizon.at(-1)} (at most ${PROGRAM_MAX_WORKOUTS} workouts). "This week" runs up to the coming Sunday, "next week" is the Monday–Sunday after it, "a month" is four weeks from today. If the request says nothing about days, plan a single workout for today, ${today}. Unless asked otherwise, skip days that already have a planned workout and leave recovery between hard sessions.`;
  const prompt = `${context}

Exercise library — name [muscle, equipment, tracking]:
${lib.text}

${task}
${wish ? `The athlete's request, in their own words: ${wish}` : "The athlete gave no further wishes."}`;
  const program = resolveProgram(await askJson(cfg, { system: PROGRAM_SYSTEM, prompt, maxTokens: PROGRAM_TOKENS }, programSchema), lib.library, allowed);
  if (program.workouts.length === 0) throw new AiError("Модель не запропонувала жодного тренування з вправами з бібліотеки. Спробуйте ще раз.");
  // Several workouts are a programme: a stage with a purpose and an expected result that can be followed and revised.
  const programme = frame
    ? await createProgram(
        userId,
        { name: frame.name.trim() || program.name || "Програма", description: frame.description.trim() || program.notes, forecast: frame.forecast.trim() || program.forecast, startsOn: frame.startsOn, endsOn: frame.endsOn },
        "ai",
      )
    : program.workouts.length > 1
      ? await createProgram(
          userId,
          { name: program.name || "Програма", description: program.notes, forecast: program.forecast, startsOn: program.workouts[0].date, endsOn: program.workouts.at(-1)!.date },
          "ai",
        )
      : null;
  const created: { id: string; name: string; date: string }[] = [];
  for (const w of program.workouts) {
    const id = await createWorkout(userId, { name: w.name, status: "planned", scheduledFor: w.date, notes: w.notes || null, exercises: w.exercises, programId: programme?.id ?? null, expectedEffort: w.effort });
    created.push({ id, name: w.name, date: w.date });
  }
  if (programme) await addRevision(userId, programme.id, "ai", `Програму склав ШІ${wish ? ` за запитом: «${wish.slice(0, 200)}»` : ""}`);
  return { created, why: program.notes, programId: programme?.id ?? null, programName: programme ? frame?.name.trim() || program.name || "Програма" : null };
}

/**
 * Revises a programme from what the athlete says: everything already done stays, the planned
 * remainder is laid out again, and the change goes into the programme's history.
 */
export async function reviseProgram(userId: string, programId: string, instruction: string) {
  const cfg = await getAiConfig(userId);
  const p = await getProgram(userId, programId);
  const today = dayOf();
  const end = p.endsOn > today ? p.endsOn : addDays(today, 27);
  const allowed: string[] = [];
  for (let d = today; d <= addDays(end, 28) && allowed.length < 84; d = addDays(d, 1)) allowed.push(d);
  const [context, lib, current] = await Promise.all([athleteContext(userId), libraryText(userId), programText(userId, programId)]);
  const what = instruction.trim().slice(0, 800);
  const prompt = `${context}

Exercise library — name [muscle, equipment, tracking]:
${lib.text}

The athlete follows this programme and wants it revised:
${current}

${what ? `What should change, in the athlete's words: ${what}` : "Nothing specific was asked — compare what has been done with the expected result and adjust the remainder so the programme stays realistic."}

Lay out the rest of the programme again: every workout from ${today} on (dates between ${today} and ${allowed.at(-1)}; it normally ends on ${end}, extend or shorten it only if the request calls for it). What is already done cannot be changed. Keep the planned workouts that still make sense as they are, and change, move, add or drop the others. Return the programme's name, purpose ("notes") and expected result ("forecast") — updated if the change affects them, unchanged otherwise — and start "forecast" with one sentence saying what you changed and why.`;
  const program = resolveProgram(await askJson(cfg, { system: PROGRAM_SYSTEM, prompt, maxTokens: PROGRAM_TOKENS }, programSchema), lib.library, allowed);
  if (program.workouts.length === 0) throw new AiError("Модель не запропонувала жодного тренування з вправами з бібліотеки. Спробуйте ще раз.");
  await clearUpcoming(userId, programId, today);
  for (const w of program.workouts) {
    await createWorkout(userId, { name: w.name, status: "planned", scheduledFor: w.date, notes: w.notes || null, exercises: w.exercises, programId, expectedEffort: w.effort });
  }
  const lastDay = program.workouts.at(-1)!.date;
  await updateProgram(
    userId,
    programId,
    { name: program.name || p.name, description: program.notes || p.description, forecast: program.forecast || p.forecast, endsOn: lastDay >= p.startsOn ? lastDay : p.endsOn },
    "ai",
    `ШІ оновив програму${what ? `: «${what.slice(0, 300)}»` : " за підсумками виконаного"}`,
  );
  return { workouts: program.workouts.length, why: program.forecast || program.notes };
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
  await updateWorkout(userId, workoutId, { name: plan.name, notes: plan.notes || null, expectedEffort: plan.effort });
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

const targetsSchema = z.object({ workouts: z.number(), cardio_min: z.number(), muscles: z.number(), why: z.string() });

/** Weekly targets (the three rings) that fit what the athlete has actually been doing and what they want. */
export async function suggestWeeklyTargets(userId: string) {
  const cfg = await getAiConfig(userId);
  const prompt = `${await athleteContext(userId, 20)}

Suggest the athlete's weekly targets — the three rings on their home screen:
- "workouts": strength workouts per week (1–14)
- "cardio_min": minutes of cardio per week (10–1200, in steps of 10)
- "muscles": how many of the 11 muscle groups should get enough load in a week (1–11)

Start from what they have really managed over the past weeks and stretch it a little toward their goals — a target they hit most weeks beats an ideal they miss. Take their experience, schedule, limitations and current illness (if any) into account.

Reply with a single JSON object and nothing else: {"workouts": number, "cardio_min": number, "muscles": number, "why": string} — "why" is two or three sentences in Ukrainian, addressed to the athlete as «ви», naming the numbers you relied on.`;
  const raw = targetsSchema.parse(await askJson(cfg, { system: SYSTEM, prompt }, targetsSchema));
  return { goals: normalizeGoals({ workouts: raw.workouts, cardioMin: Math.round(raw.cardio_min / 10) * 10, muscles: raw.muscles }), why: raw.why.trim().slice(0, 600) };
}
