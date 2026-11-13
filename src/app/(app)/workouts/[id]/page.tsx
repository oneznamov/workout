import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui";
import { notFound } from "next/navigation";
import { WorkoutEditor } from "@/components/workout/editor";
import { getAiState, getWorkoutNote } from "@/lib/ai";
import { getWorkoutRecords } from "@/lib/analytics";
import { getProgram } from "@/lib/programs";
import { lightenRequest, needsLighter } from "@/lib/readiness";
import { getReadiness } from "@/lib/recovery";
import { requireUserId } from "@/lib/auth";
import { addDays, dayOf } from "@/lib/format";
import { listHealthWorkouts } from "@/lib/health";
import { toClientLast, toClientWorkout } from "@/lib/shape";
import { getWorkout, lastPerformance, listExercises, NotFoundError } from "@/lib/workouts";

export const metadata = { title: "Тренування" };

async function Content({ params }: PageProps<"/workouts/[id]">) {
  const { id } = await params;
  const userId = await requireUserId();
  const workout = await getWorkout(userId, id).catch((e) => {
    if (e instanceof NotFoundError || /uuid/i.test(String(e?.cause?.message ?? e?.message))) notFound();
    throw e;
  });

  const day = dayOf(workout.startedAt ?? new Date());
  const [exercises, last, candidates, ai, note, records, program] = await Promise.all([
    listExercises(userId),
    lastPerformance(userId, undefined, workout.id),
    workout.status === "completed"
      ? listHealthWorkouts(userId, { from: addDays(day, -1), to: addDays(day, 1), unlinkedOnly: true })
      : Promise.resolve([]),
    getAiState(userId),
    getWorkoutNote(userId, workout.id),
    workout.status === "completed" ? getWorkoutRecords(userId, workout.id) : [],
    workout.programId ? getProgram(userId, workout.programId).catch(() => null) : null,
  ]);
  // A workout planned for today after a short night: offer to make it lighter.
  const ready = workout.status === "planned" && workout.scheduledFor === dayOf() ? await getReadiness(userId) : null;

  return (
    <WorkoutEditor
      key={workout.id}
      ai={ai ? { auto: ai.auto, note } : undefined}
      program={program ? { id: program.id, name: program.name } : undefined}
      readiness={ready && needsLighter(ready) ? { label: `Сьогодні ${ready.reasons.join("; ")}. ${ready.advice}`, request: lightenRequest(ready) } : undefined}
      records={records.map((r) => ({ name: r.name, now: `${r.weight} кг × ${r.reps}`, before: `${r.before.weight} кг × ${r.before.reps}` }))}
      initial={toClientWorkout(workout)}
      last={toClientLast(last)}
      exercises={[...exercises].sort((a, b) => a.name.localeCompare(b.name)).map(({ id, name, nameUk, muscle, equipment, tracking }) => ({ id, name, nameUk, muscle, equipment, tracking }))}
      healthCandidates={candidates.map((c) => ({
        id: c.id,
        activityType: c.activityType,
        startAt: c.startAt.toISOString(),
        durationSec: c.durationSec,
        avgHr: c.avgHr,
      }))}
    />
  );
}

export default function Page(props: PageProps<"/workouts/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content {...props} />
    </Suspense>
  );
}
