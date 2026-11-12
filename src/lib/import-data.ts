import "server-only";
import { randomUUID } from "node:crypto";
import { eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { aiNotes, exercises, healthMetrics, programRevisions, programs, sets, users, workoutExercises, workouts, type ProgramSnapshot } from "@/db/schema";
import type { ImportData, ImportResult } from "./import-schema";
import { normalizeProfile, type Profile } from "./profile";

const chunks = <T>(rows: T[], size: number) => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));
const date = (v: string | null | undefined) => (v ? new Date(v) : null);
const key = (name: string) => name.trim().toLowerCase();

/** A profile is merged gently: what the account already says wins, the file only fills gaps and adds goals. */
function mergeProfile(current: Profile, incoming: Profile): Profile {
  const titles = new Set(current.goals.map((g) => key(g.title)));
  const pauses = new Set(current.sickHistory.map((p) => `${p.from}:${p.to}`));
  return normalizeProfile({
    ...current,
    about: current.about || incoming.about,
    sex: current.sex ?? incoming.sex,
    birthDate: current.birthDate ?? incoming.birthDate,
    heightCm: current.heightCm ?? incoming.heightCm,
    experience: current.experience ?? incoming.experience,
    goals: [...current.goals, ...incoming.goals.filter((g) => !titles.has(key(g.title)))],
    sickHistory: [...current.sickHistory, ...incoming.sickHistory.filter((p) => !pauses.has(`${p.from}:${p.to}`))],
  });
}

/**
 * Brings a data export into the account. Nothing already there is changed or removed: workouts
 * and programmes the account already has are skipped, exercises are matched by name (missing
 * ones become the account's own), body and health records only fill empty days.
 */
export async function importData(userId: string, data: ImportData): Promise<ImportResult> {
  const result: ImportResult = { workouts: 0, programs: 0, exercises: 0, metrics: 0, notes: 0, skipped: 0, profile: false };

  // ── Profile ──
  if (data.profile) {
    const [u] = await db.select({ profile: users.profile }).from(users).where(eq(users.id, userId));
    const current = normalizeProfile(u?.profile);
    const merged = mergeProfile(current, normalizeProfile(data.profile));
    if (JSON.stringify(merged) !== JSON.stringify(current)) {
      await db.update(users).set({ profile: merged }).where(eq(users.id, userId));
      result.profile = true;
    }
  }

  // ── Exercises: by name; whatever is unknown becomes the account's own ──
  const visible = await db
    .select({ id: exercises.id, name: exercises.name })
    .from(exercises)
    .where(or(isNull(exercises.userId), eq(exercises.userId, userId)));
  const byName = new Map(visible.map((e) => [key(e.name), e.id]));
  const wanted = new Map<string, ImportData["customExercises"][number]>();
  for (const e of [...data.customExercises, ...data.workouts.flatMap((w) => w.exercises)]) if (!byName.has(key(e.name)) && !wanted.has(key(e.name))) wanted.set(key(e.name), e);
  for (const part of chunks([...wanted.values()], 200)) {
    const made = await db
      .insert(exercises)
      .values(part.map((e) => ({ userId, name: e.name, nameUk: e.nameUk ?? null, muscle: e.muscle, equipment: e.equipment, tracking: e.tracking })))
      .returning({ id: exercises.id, name: exercises.name });
    for (const e of made) byName.set(key(e.name), e.id);
    result.exercises += made.length;
  }

  // ── Programmes ──
  const programIds = data.programs.flatMap((p) => (p.id ? [p.id] : []));
  const takenPrograms = programIds.length ? await db.select({ id: programs.id, userId: programs.userId }).from(programs).where(inArray(programs.id, programIds)) : [];
  const programMap = new Map<string, string>();
  for (const p of data.programs) {
    const taken = p.id ? takenPrograms.find((t) => t.id === p.id) : undefined;
    if (taken?.userId === userId) {
      // Already here: its workouts still attach to it.
      programMap.set(p.id!, p.id!);
      result.skipped++;
      continue;
    }
    const newId = p.id && !taken ? p.id : randomUUID();
    if (p.id) programMap.set(p.id, newId);
    await db.insert(programs).values({ id: newId, userId, name: p.name, description: p.description, forecast: p.forecast, startsOn: p.startsOn, endsOn: p.endsOn < p.startsOn ? p.startsOn : p.endsOn, ...(date(p.createdAt) ? { createdAt: date(p.createdAt)! } : {}) });
    const revisions = p.revisions.filter((r) => r.snapshot && typeof r.snapshot === "object" && Array.isArray((r.snapshot as { workouts?: unknown }).workouts));
    for (const part of chunks(revisions, 100)) {
      await db.insert(programRevisions).values(part.map((r) => ({ programId: newId, source: r.source, summary: r.summary, snapshot: r.snapshot as ProgramSnapshot, ...(date(r.createdAt) ? { createdAt: date(r.createdAt)! } : {}) })));
    }
    result.programs++;
  }

  // ── Workouts ──
  const workoutIds = data.workouts.flatMap((w) => (w.id ? [w.id] : []));
  const taken = new Map<string, string>();
  for (const part of chunks(workoutIds, 1000)) {
    for (const row of await db.select({ id: workouts.id, userId: workouts.userId }).from(workouts).where(inArray(workouts.id, part))) taken.set(row.id, row.userId);
  }
  const workoutMap = new Map<string, string>();
  const workoutRows: (typeof workouts.$inferInsert)[] = [];
  const exerciseRows: (typeof workoutExercises.$inferInsert)[] = [];
  const setRows: (typeof sets.$inferInsert)[] = [];
  for (const w of data.workouts) {
    // A workout that is running somewhere else is not a record yet; one the account already has stays as it is.
    if (w.status === "in_progress" || (w.id && taken.get(w.id) === userId)) {
      result.skipped++;
      continue;
    }
    const newId = w.id && !taken.has(w.id) ? w.id : randomUUID();
    if (w.id) workoutMap.set(w.id, newId);
    workoutRows.push({
      id: newId,
      userId,
      programId: (w.programId && programMap.get(w.programId)) || null,
      name: w.name,
      status: w.status,
      scheduledFor: w.scheduledFor ?? null,
      startedAt: date(w.startedAt),
      endedAt: date(w.endedAt),
      pausedSec: w.pausedSec,
      notes: w.notes ?? null,
      effort: w.effort ?? null,
      ...(date(w.createdAt) ? { createdAt: date(w.createdAt)! } : {}),
    });
    w.exercises.forEach((e, position) => {
      const weId = randomUUID();
      exerciseRows.push({ id: weId, workoutId: newId, exerciseId: byName.get(key(e.name))!, position, restSeconds: e.restSeconds ?? null, notes: e.notes ?? null });
      e.sets.forEach((s, i) =>
        setRows.push({
          workoutExerciseId: weId,
          position: i,
          type: s.type,
          weight: s.weight ?? null,
          reps: s.reps ?? null,
          durationSec: s.durationSec ?? null,
          distanceM: s.distanceM ?? null,
          speedKmh: s.speedKmh ?? null,
          incline: s.incline ?? null,
          rpe: s.rpe ?? null,
          completed: s.completed,
          completedAt: date(s.completedAt),
        }),
      );
    });
  }
  for (const part of chunks(workoutRows, 200)) await db.insert(workouts).values(part);
  for (const part of chunks(exerciseRows, 500)) await db.insert(workoutExercises).values(part);
  for (const part of chunks(setRows, 1000)) await db.insert(sets).values(part);
  result.workouts = workoutRows.length;

  // ── The AI's reviews of the workouts that came in ──
  const reviews = (data.ai?.notes ?? []).filter((n) => n.kind === "workout" && workoutMap.has(n.ref));
  for (const part of chunks(reviews, 200)) {
    const made = await db
      .insert(aiNotes)
      .values(part.map((n) => ({ userId, kind: "workout" as const, ref: workoutMap.get(n.ref)!, content: n.content, model: n.model || "imported", ...(date(n.createdAt) ? { createdAt: date(n.createdAt)! } : {}) })))
      .onConflictDoNothing()
      .returning({ id: aiNotes.id });
    result.notes += made.length;
  }

  // ── Body and health records: only days that are still empty ──
  for (const part of chunks(data.healthMetrics, 1000)) {
    const made = await db
      .insert(healthMetrics)
      .values(part.map((m) => ({ userId, metric: m.metric, day: m.day, value: m.value, unit: m.unit ?? null, source: m.source })))
      .onConflictDoNothing()
      .returning({ id: healthMetrics.id });
    result.metrics += made.length;
  }
  return result;
}
