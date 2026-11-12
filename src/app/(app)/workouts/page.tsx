import { Suspense } from "react";
import { PlanWithAi } from "@/components/ai";
import { NewWorkoutButtons } from "@/components/workout/new-workout";
import { CalendarDays, History, LayoutTemplate } from "lucide-react";
import { PlannedCard, WorkoutList, WorkoutRow, WorkoutTable } from "@/components/workout/workout-row";
import Link from "next/link";
import { Empty, PageHeader, PageSkeleton, SectionTitle } from "@/components/ui";
import { getAiState } from "@/lib/ai";
import { getUser } from "@/lib/auth";
import { listWorkouts } from "@/lib/workouts";

export const metadata = { title: "Тренування" };

async function Content() {
  const user = await getUser();
  const userId = user.id;
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
        {/* Ahead: outlined date cards. Behind: a filled table (cards on the phone). The two never look alike. */}
        <section>
          <SectionTitle>
            <span className="flex items-center gap-2">
              <CalendarDays size={20} className="text-accent" /> Заплановані
            </span>
          </SectionTitle>
          {planned.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {planned.map((w) => (
                <PlannedCard key={w.id} w={w} />
              ))}
            </div>
          ) : (
            <div className="rounded-[20px] border border-dashed border-line p-6 text-center text-sm text-muted">
              Запланованих тренувань немає. Створіть самі{ai ? ", натисніть «Скласти з ШІ»" : ""} або попросіть Claude скласти план.
            </div>
          )}
        </section>
        {templates.length > 0 && (
          <section>
            <SectionTitle>
              <span className="flex items-center gap-2">
                <LayoutTemplate size={20} className="text-muted" /> Шаблони
              </span>
            </SectionTitle>
            <div className="grid gap-3 lg:hidden">
              {templates.map((w) => (
                <WorkoutRow key={w.id} w={w} />
              ))}
            </div>
            <WorkoutList rows={templates} className="hidden lg:block" />
          </section>
        )}
        <section className="border-t border-line pt-7">
          <SectionTitle>
            <span className="flex items-center gap-2">
              <History size={20} className="text-muted" /> Історія
              {history.length > 0 && <span className="text-base font-medium text-muted">{history.length}</span>}
            </span>
          </SectionTitle>
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
