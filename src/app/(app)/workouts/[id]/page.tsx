import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui";
import { notFound } from "next/navigation";
import { WorkoutEditor } from "@/components/workout/editor";
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
  const [exercises, last, candidates] = await Promise.all([
    listExercises(userId),
    lastPerformance(userId, undefined, workout.id),
    workout.status === "completed"
      ? listHealthWorkouts(userId, { from: addDays(day, -1), to: addDays(day, 1), unlinkedOnly: true })
      : Promise.resolve([]),
  ]);

  return (
    <WorkoutEditor
      key={workout.id}
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
