import { z } from "zod";

/** What the model is asked to return when it plans or extends a workout. Pure — shared by the server and tests. */
export const planSchema = z.object({
  name: z.string(),
  notes: z.string(),
  exercises: z.array(
    z.object({
      exercise: z.string(),
      rest_seconds: z.number().nullable(),
      notes: z.string().nullable(),
      sets: z.array(
        z.object({
          weight: z.number().nullable(),
          reps: z.number().nullable(),
          duration_sec: z.number().nullable(),
        }),
      ),
    }),
  ),
});
export type PlanDraft = z.infer<typeof planSchema>;

export const PLAN_SHAPE = `{
  "name": string,                 // short workout name in Ukrainian
  "notes": string,                // one or two sentences: why this session, in Ukrainian
  "exercises": [{
    "exercise": string,           // exact "name" of an exercise from the library below
    "rest_seconds": number|null,  // rest between sets
    "notes": string|null,         // optional cue for the athlete, in Ukrainian
    "sets": [{ "weight": number|null, "reps": number|null, "duration_sec": number|null }]
  }]
}`;

/** Several workouts at once: a week's programme or a set of chosen days. */
export const programSchema = z.object({
  notes: z.string(),
  workouts: z.array(planSchema.extend({ date: z.string() })),
});

export const PROGRAM_SHAPE = `{
  "notes": string,                // two or three sentences: the idea of the programme, in Ukrainian
  "workouts": [{
    "date": "YYYY-MM-DD",         // one of the allowed days
    "name": string,
    "notes": string,
    "exercises": [ ...same as in a single workout... ]
  }]
}`;

type LibraryItem = { id: string; name: string; nameUk: string | null; tracking: string };
export type PlannedExercise = {
  exerciseId: string;
  restSeconds: number | null;
  notes: string | null;
  sets: { weight: number | null; reps: number | null; durationSec: number | null }[];
};

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const clampInt = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : null);

/** Pulls a JSON object out of a model reply, tolerating code fences and stray text around it. */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON in the reply");
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Turns a model's draft into something safe to store: exercises are matched to the library by
 * name (unknown ones are dropped), numbers are clamped to sane ranges, empty exercises removed.
 */
export function resolvePlan(raw: unknown, library: LibraryItem[], skipIds: string[] = []) {
  const draft = planSchema.parse(raw);
  const byName = new Map<string, LibraryItem>();
  for (const e of library) {
    byName.set(norm(e.name), e);
    if (e.nameUk) byName.set(norm(e.nameUk), e);
  }
  const used = new Set(skipIds);
  const unknown: string[] = [];
  const exercises: PlannedExercise[] = [];
  for (const item of draft.exercises) {
    const found = byName.get(norm(item.exercise));
    if (!found) {
      unknown.push(item.exercise);
      continue;
    }
    if (used.has(found.id)) continue;
    const timed = found.tracking === "duration" || found.tracking === "distance";
    const sets = item.sets.slice(0, 8).map((s) => {
      const w = typeof s.weight === "number" && Number.isFinite(s.weight) && s.weight > 0 ? Math.min(500, Math.round(s.weight * 4) / 4) : null;
      return {
        weight: timed ? null : w,
        reps: timed ? null : clampInt(s.reps, 1, 100),
        durationSec: timed ? (clampInt(s.duration_sec, 5, 3600) ?? 30) : null,
      };
    });
    if (sets.length === 0) continue;
    used.add(found.id);
    exercises.push({
      exerciseId: found.id,
      restSeconds: clampInt(item.rest_seconds, 20, 600),
      notes: item.notes?.trim().slice(0, 300) || null,
      sets,
    });
    if (exercises.length >= 12) break;
  }
  return { name: draft.name.trim().slice(0, 80) || "Тренування", notes: draft.notes.trim().slice(0, 600), exercises, unknown };
}

/** A programme draft made safe to store: only allowed days, one workout per day, each resolved like a single plan. */
export function resolveProgram(raw: unknown, library: LibraryItem[], allowedDays: string[]) {
  const draft = programSchema.parse(raw);
  const allowed = new Set(allowedDays);
  const taken = new Set<string>();
  const workouts: (ReturnType<typeof resolvePlan> & { date: string })[] = [];
  for (const w of draft.workouts) {
    const date = w.date.trim().slice(0, 10);
    if (!allowed.has(date) || taken.has(date)) continue;
    const plan = resolvePlan(w, library);
    if (plan.exercises.length === 0) continue;
    taken.add(date);
    workouts.push({ ...plan, date });
    if (workouts.length >= 7) break;
  }
  workouts.sort((a, b) => a.date.localeCompare(b.date));
  return { notes: draft.notes.trim().slice(0, 800), workouts };
}
