import { Suspense } from "react";
import { PlanWithAi } from "@/components/ai";
import { NewWorkoutButtons } from "@/components/workout/new-workout";
import { CalendarDays, History, LayoutTemplate, Route } from "lucide-react";
import { ProgramCard } from "@/components/program-card";
import { NewProgramButton } from "@/components/programs";
import { listPrograms } from "@/lib/programs";
import { PlannedCard, WorkoutList, WorkoutRow, WorkoutTable } from "@/components/workout/workout-row";
import Link from "next/link";
import { CardioForm } from "@/components/cardio/cardio-form";
import { CardioRow, CardioTable } from "@/components/cardio/cardio-row";
import { Disclosure, Empty, PageHeader, PageSkeleton, SectionTitle, Segmented } from "@/components/ui";
import { listCardio } from "@/lib/cardio";
import { normalizeProfile } from "@/lib/profile";
import { dayOf } from "@/lib/format";
import { getAiState } from "@/lib/ai";
import { getUser } from "@/lib/auth";
import { listWorkouts } from "@/lib/workouts";

export const metadata = { title: "Тренування" };

const TYPES = [
  { value: "all", label: "Усі" },
  { value: "strength", label: "Силові" },
  { value: "cardio", label: "Кардіо" },
];

async function Content({ searchParams }: PageProps<"/workouts">) {
  const user = await getUser();
  const userId = user.id;
  const sick = Boolean(normalizeProfile(user.profile).sick);
  const sp = await searchParams;
  const type = TYPES.some((t) => t.value === sp.t) ? String(sp.t) : "all";
  const [all, ai, cardioAll, programs] = await Promise.all([
    listWorkouts(userId, { limit: 300 }),
    getAiState(userId),
    listCardio(userId, { limit: 200 }),
    listPrograms(userId),
  ]);
  const today = dayOf();
  const currentPrograms = programs.filter((p) => p.endsOn >= today);
  const pastPrograms = programs.filter((p) => p.endsOn < today).reverse();
  const active = all.filter((w) => w.status === "in_progress");
  const planned = all
    .filter((w) => w.status === "planned")
    .sort((a, b) => (a.scheduledFor ?? "9999").localeCompare(b.scheduledFor ?? "9999"));
  const templates = all.filter((w) => w.status === "template");
  const history = all.filter((w) => w.status === "completed");
  // History: strength workouts and cardio sessions, filtered by kind.
  const strength = type === "cardio" ? [] : history;
  const cardio = type === "strength" ? [] : cardioAll;
  const feed = [
    ...strength.map((w) => ({ kind: "strength" as const, at: w.startedAt?.getTime() ?? 0, w })),
    ...cardio.map((s) => ({ kind: "cardio" as const, at: s.startAt.getTime(), s })),
  ].sort((a, b) => b.at - a.at);
  const shownCount = strength.length + cardio.length;

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
        {/* Programmes: stages the planned workouts belong to. */}
        <section>
          <SectionTitle action={<NewProgramButton />}>
            <span className="flex items-center gap-2">
              <Route size={20} className="text-accent" /> Програми
            </span>
          </SectionTitle>
          {currentPrograms.length ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {currentPrograms.map((p) => (
                <ProgramCard key={p.id} p={p} today={today} />
              ))}
            </div>
          ) : (
            <div className="rounded-[20px] border border-dashed border-line p-5 text-center text-sm text-muted">
              Програма — це етап із метою й очікуваним результатом: наприклад, вступний місяць, а далі складніший.
              {ai ? " Попросіть у «Скласти з ШІ» програму на кілька тижнів або створіть свою." : " Створіть свою або попросіть Claude."}
            </div>
          )}
          {pastPrograms.length > 0 && (
            <div className="mt-3">
              <Disclosure title={`Минулі програми · ${pastPrograms.length}`} hint="Що було раніше і чим закінчилось">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {pastPrograms.map((p) => (
                    <ProgramCard key={p.id} p={p} today={today} />
                  ))}
                </div>
              </Disclosure>
            </div>
          )}
        </section>

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
                <PlannedCard key={w.id} w={w} sick={sick} />
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
              {shownCount > 0 && <span className="text-base font-medium text-muted">{shownCount}</span>}
            </span>
          </SectionTitle>
          <div className="mb-3">
            <Segmented options={TYPES} current={type} param="t" label="Вид тренувань" />
          </div>
          {shownCount === 0 ? (
            <Empty>{type === "cardio" ? "Кардіо ще немає: запишіть «Біг» чи «Велосипед» на Apple Watch або додайте вручну нижче." : "Ще немає завершених тренувань."}</Empty>
          ) : (
            <>
              {/* Phone: one feed, strength and cardio together, newest first. */}
              <div className="grid gap-3 lg:hidden">
                {feed.map((item) => (item.kind === "strength" ? <WorkoutRow key={item.w.id} w={item.w} /> : <CardioRow key={item.s.id} s={item.s} />))}
              </div>
              {/* Desktop: a table per kind — their columns differ. */}
              <div className="hidden space-y-5 lg:block">
                {strength.length > 0 && <WorkoutTable rows={strength} />}
                {cardio.length > 0 && (
                  <div>
                    {strength.length > 0 && <h3 className="caps mb-2 px-1">Кардіо</h3>}
                    <CardioTable rows={cardio} />
                  </div>
                )}
              </div>
            </>
          )}
          {type !== "strength" && (
            <div className="mt-4">
              <Disclosure title="Додати кардіо вручну" hint="Якщо пробіжку чи заїзд не записав годинник">
                <CardioForm today={dayOf()} />
              </Disclosure>
            </div>
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

export default function Page(props: PageProps<"/workouts">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content {...props} />
    </Suspense>
  );
}
