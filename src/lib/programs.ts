import "server-only";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { programRevisions, programs, users, workouts, type ProgramSnapshot } from "@/db/schema";
import { setText } from "./set-text";
import { addDays, dayOf } from "./format";
import { goalLine, linkedGoals, normalizeProfile, PROFILE_LIMITS, type Goal } from "./profile";
import { NotFoundError } from "./workouts";

export type RevisionSource = "manual" | "ai" | "claude";
export type ProgramInput = { name: string; description?: string; forecast?: string; /** ids of the goals it serves */ goalIds?: string[]; startsOn: string; endsOn: string };

const cleanGoalIds = (ids: unknown): string[] => [...new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 64) : [])].slice(0, PROFILE_LIMITS.goals);

const isDay = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

function clean(input: ProgramInput) {
  if (!isDay(input.startsOn) || !isDay(input.endsOn)) throw new Error("Некоректні дати програми");
  const [startsOn, endsOn] = input.startsOn <= input.endsOn ? [input.startsOn, input.endsOn] : [input.endsOn, input.startsOn];
  return {
    name: input.name.trim().slice(0, 80) || "Програма",
    description: (input.description ?? "").trim().slice(0, 2000),
    forecast: (input.forecast ?? "").trim().slice(0, 2000),
    goalIds: cleanGoalIds(input.goalIds),
    startsOn,
    endsOn,
  };
}

async function own(userId: string, id: string) {
  const [p] = await db.select().from(programs).where(and(eq(programs.id, id), eq(programs.userId, userId)));
  if (!p) throw new NotFoundError("Програму не знайдено");
  return p;
}

/** Workouts of a programme with their exercises, oldest first. */
async function programWorkouts(userId: string, programId: string) {
  const all = await db.query.workouts.findMany({
    where: and(eq(workouts.userId, userId), eq(workouts.programId, programId)),
    with: { exercises: { orderBy: (we, { asc: up }) => [up(we.position)], with: { exercise: { columns: { name: true, muscle: true } }, sets: { orderBy: (s, { asc: up }) => [up(s.position)] } } } },
  });
  const when = (w: (typeof all)[number]) => (w.startedAt ? dayOf(w.startedAt) : (w.scheduledFor ?? "9999-99-99"));
  return all.sort((a, b) => when(a).localeCompare(when(b)));
}

/** What the programme looks like right now — stored with every revision, so its history can be read later. */
async function snapshot(userId: string, id: string): Promise<ProgramSnapshot> {
  const p = await own(userId, id);
  const list = await programWorkouts(userId, id);
  return {
    name: p.name,
    description: p.description,
    forecast: p.forecast,
    startsOn: p.startsOn,
    endsOn: p.endsOn,
    workouts: list.map((w) => ({
      date: w.startedAt ? dayOf(w.startedAt) : w.scheduledFor,
      name: w.name,
      status: w.status,
      exercises: w.exercises.map((e) => `${e.exercise.name}: ${e.sets.filter((s) => w.status !== "completed" || s.completed).map(setText).join(", ") || "—"}`),
    })),
  };
}

/** Records a point in the programme's history. Call it after the change is in place. */
export async function addRevision(userId: string, id: string, source: RevisionSource, summary: string) {
  await db.insert(programRevisions).values({ programId: id, source, summary: summary.trim().slice(0, 600) || "Зміни в програмі", snapshot: await snapshot(userId, id) });
  await db.update(programs).set({ updatedAt: new Date() }).where(eq(programs.id, id));
}

export async function createProgram(userId: string, input: ProgramInput, source: RevisionSource, summary = "Програму створено") {
  const [p] = await db.insert(programs).values({ userId, ...clean(input) }).returning({ id: programs.id });
  return { id: p.id, summary, source };
}

export async function updateProgram(userId: string, id: string, patch: Partial<ProgramInput>, source: RevisionSource, summary: string) {
  const p = await own(userId, id);
  const next = clean({ name: patch.name ?? p.name, description: patch.description ?? p.description, forecast: patch.forecast ?? p.forecast, goalIds: patch.goalIds ?? p.goalIds, startsOn: patch.startsOn ?? p.startsOn, endsOn: patch.endsOn ?? p.endsOn });
  await db.update(programs).set({ ...next, updatedAt: new Date() }).where(eq(programs.id, id));
  await addRevision(userId, id, source, summary);
}

/** Removes a programme. Its finished workouts stay in the diary; planned ones go with it unless `keepPlanned`. */
export async function deleteProgram(userId: string, id: string, keepPlanned = false) {
  await own(userId, id);
  if (!keepPlanned) await db.delete(workouts).where(and(eq(workouts.userId, userId), eq(workouts.programId, id), eq(workouts.status, "planned")));
  await db.delete(programs).where(eq(programs.id, id));
}

/** Drops the programme's planned workouts from `from` on — used before the AI lays out a new remainder. */
export async function clearUpcoming(userId: string, id: string, from: string) {
  await own(userId, id);
  await db.delete(workouts).where(and(eq(workouts.userId, userId), eq(workouts.programId, id), eq(workouts.status, "planned"), gte(workouts.scheduledFor, from)));
}

export async function listPrograms(userId: string) {
  const rows = await db.select().from(programs).where(eq(programs.userId, userId)).orderBy(asc(programs.startsOn), asc(programs.createdAt));
  if (rows.length === 0) return [];
  const counts = await db
    .select({
      programId: workouts.programId,
      total: sql<number>`count(*) filter (where ${workouts.status} in ('planned', 'completed', 'in_progress'))::int`,
      done: sql<number>`count(*) filter (where ${workouts.status} = 'completed')::int`,
      next: sql<string | null>`min(${workouts.scheduledFor}) filter (where ${workouts.status} = 'planned')`,
    })
    .from(workouts)
    .where(
      and(
        eq(workouts.userId, userId),
        inArray(
          workouts.programId,
          rows.map((r) => r.id),
        ),
      ),
    )
    .groupBy(workouts.programId);
  return rows.map((p) => {
    const c = counts.find((x) => x.programId === p.id);
    return { ...p, total: c?.total ?? 0, done: c?.done ?? 0, next: c?.next ?? null };
  });
}
export type ProgramListItem = Awaited<ReturnType<typeof listPrograms>>[number];

export async function getProgram(userId: string, id: string) {
  const p = await own(userId, id);
  const revisions = await db
    .select({ id: programRevisions.id, source: programRevisions.source, summary: programRevisions.summary, snapshot: programRevisions.snapshot, createdAt: programRevisions.createdAt })
    .from(programRevisions)
    .where(eq(programRevisions.programId, id))
    .orderBy(desc(programRevisions.createdAt));
  return { ...p, revisions };
}

/** The athlete's goals a programme is tied to, in the order they are written in the profile. Goals deleted since are skipped. */
export async function programGoals(userId: string, goalIds: string[]): Promise<Goal[]> {
  if (goalIds.length === 0) return [];
  const [u] = await db.select({ profile: users.profile }).from(users).where(eq(users.id, userId));
  return linkedGoals(normalizeProfile(u?.profile).goals, goalIds);
}

/** The programme as text for a prompt: what it is for, what has been done in it, what is still planned. */
export async function programText(userId: string, id: string) {
  const s = await snapshot(userId, id);
  const goals = await programGoals(userId, (await own(userId, id)).goalIds);
  const line = (w: ProgramSnapshot["workouts"][number]) => `  ${w.date ?? "no date"} · ${w.name}\n${w.exercises.map((e) => `    ${e}`).join("\n")}`;
  const done = s.workouts.filter((w) => w.status === "completed");
  const ahead = s.workouts.filter((w) => w.status === "planned");
  return `Programme "${s.name}" (${s.startsOn} … ${s.endsOn})
Goals it serves: ${goals.map(goalLine).join("; ") || "none chosen"}
Purpose: ${s.description || "not written down"}
Expected result: ${s.forecast || "not written down"}
Done so far (${done.length}):
${done.map(line).join("\n") || "  nothing yet"}
Still planned (${ahead.length}):
${ahead.map(line).join("\n") || "  nothing"}`;
}

/** Programmes in short, for the athlete context every AI reads. */
export async function programsForContext(userId: string) {
  const today = dayOf();
  return (await listPrograms(userId))
    .filter((p) => p.endsOn >= addDays(today, -120))
    .map((p) => ({
      name: p.name,
      from: p.startsOn,
      to: p.endsOn,
      state: today < p.startsOn ? "upcoming" : today > p.endsOn ? "finished" : "current",
      goalIds: p.goalIds,
      purpose: p.description || undefined,
      expected_result: p.forecast || undefined,
      workouts_done: p.done,
      workouts_in_total: p.total,
    }));
}
