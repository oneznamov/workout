import { Suspense } from "react";
import { PlanWithAi } from "@/components/ai";
import { NewWorkoutButtons } from "@/components/workout/new-workout";
import { WorkoutList, WorkoutRow, WorkoutTable } from "@/components/workout/workout-row";
import Link from "next/link";
import { Empty, PageHeader, PageSkeleton, SectionTitle } from "@/components/ui";
import { getAiState } from "@/lib/ai";
import { requireUserId } from "@/lib/auth";
import { listWorkouts } from "@/lib/workouts";

export const metadata = { title: "Тренування" };

async function Content() {
  const userId = await requireUserId();
  const [all, ai] = await Promise.all([listWorkouts(userId, { limit: 300 }), getAiState(userId)]);
  const active = all.filter((w) => w.status === "in_progress");
  const planned = all
    .filter((w) => w.status === "planned")
    .sort((a, b) => (a.scheduledFor ?? "9999").localeCompare(b.scheduledFor ?? "9999"));
  const templates = all.filter((w) => w.status === "template");
  const history = all.filter((w) => w.status === "completed");

  return (
    <>
      <PageHeader
        title="Тренування"
        subtitle={
          <Link href="/exercises" className="text-accent">
            Бібліотека вправ →
          </Link>
        }
        actions={
          <>
            <NewWorkoutButtons />
            {ai && <PlanWithAi />}
          </>
        }
      />
      <div className="space-y-8">
        {active.length > 0 && (
          <Section title="Зараз триває">
            {active.map((w) => (
              <WorkoutRow key={w.id} w={w} />
            ))}
          </Section>
        )}
        {/* Phone: cards. Desktop: planned and templates side by side as compact lists, history as a table. */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-6">
          <section className={templates.length ? undefined : "lg:col-span-2"}>
            <SectionTitle>Заплановані</SectionTitle>
            {planned.length ? (
              <>
                <div className="grid gap-3 lg:hidden">
                  {planned.map((w) => (
                    <WorkoutRow key={w.id} w={w} />
                  ))}
                </div>
                <WorkoutList rows={planned} className="hidden lg:block" />
              </>
            ) : (
              <Empty>Запланованих тренувань немає. Створіть самі{ai ? ", натисніть «Скласти з ШІ»" : ""} або попросіть Claude скласти план.</Empty>
            )}
          </section>
          {templates.length > 0 && (
            <section>
              <SectionTitle>Шаблони</SectionTitle>
              <div className="grid gap-3 lg:hidden">
                {templates.map((w) => (
                  <WorkoutRow key={w.id} w={w} />
                ))}
              </div>
              <WorkoutList rows={templates} className="hidden lg:block" />
            </section>
          )}
        </div>
        <section>
          <SectionTitle>{`Історія${history.length ? ` · ${history.length}` : ""}`}</SectionTitle>
          {history.length ? (
            <>
              <div className="grid gap-3 lg:hidden">
                {history.map((w) => (
                  <WorkoutRow key={w.id} w={w} />
                ))}
              </div>
              <WorkoutTable rows={history} className="hidden lg:block" />
            </>
          ) : (
            <Empty>Ще немає завершених тренувань.</Empty>
          )}
        </section>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">{children}</div>
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
