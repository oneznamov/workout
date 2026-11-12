import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui";
import { ExerciseBrowser } from "@/components/exercise-browser";
import { PageHeader } from "@/components/ui";
import { requireUserId } from "@/lib/auth";
import { listExercises } from "@/lib/workouts";

export const metadata = { title: "Вправи" };

async function Content() {
  const userId = await requireUserId();
  const exercises = await listExercises(userId);
  return (
    <>
      <PageHeader title="Вправи" subtitle={`${exercises.length} вправ у бібліотеці · свої можна додати під час тренування`} />
      <ExerciseBrowser
        exercises={exercises.map(({ id, name, nameUk, muscle, equipment, tracking, custom }) => ({ id, name, nameUk, muscle, equipment, tracking, custom }))}
      />
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}
