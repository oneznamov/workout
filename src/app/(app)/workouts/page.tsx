import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui";
import { NewWorkoutButtons } from "@/components/workout/new-workout";
import { WorkoutRow } from "@/components/workout/workout-row";
import { Empty, PageHeader } from "@/components/ui";
import { requireUserId } from "@/lib/auth";
import { listWorkouts } from "@/lib/workouts";

export const metadata = { title: "Тренування" };

async function Content() {
  const userId = await requireUserId();
  const all = await listWorkouts(userId, { limit: 300 });
  const active = all.filter((w) => w.status === "in_progress");
  const planned = all
    .filter((w) => w.status === "planned")
    .sort((a, b) => (a.scheduledFor ?? "9999").localeCompare(b.scheduledFor ?? "9999"));
  const templates = all.filter((w) => w.status === "template");
  const history = all.filter((w) => w.status === "completed");

  return (
    <>
      <PageHeader title="Тренування" actions={<NewWorkoutButtons />} />
      <div className="space-y-8">
        {active.length > 0 && (
          <Section title="Зараз триває">
            {active.map((w) => (
              <WorkoutRow key={w.id} w={w} />
            ))}
          </Section>
        )}
        <Section title="Заплановані">
          {planned.length ? (
            planned.map((w) => <WorkoutRow key={w.id} w={w} />)
          ) : (
            <Empty>Запланованих тренувань немає. Створіть самі або попросіть Claude скласти план.</Empty>
          )}
        </Section>
        {templates.length > 0 && (
          <Section title="Шаблони">
            {templates.map((w) => (
              <WorkoutRow key={w.id} w={w} />
            ))}
          </Section>
        )}
        <Section title={`Історія${history.length ? ` · ${history.length}` : ""}`}>
          {history.length ? history.map((w) => <WorkoutRow key={w.id} w={w} />) : <Empty>Ще немає завершених тренувань.</Empty>}
        </Section>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-ink-2">{title}</h2>
      <div className="grid gap-2 lg:grid-cols-2">{children}</div>
    </section>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}
