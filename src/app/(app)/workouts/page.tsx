import { Suspense } from "react";
import { NewWorkoutButtons } from "@/components/workout/new-workout";
import { BookOpen, CalendarDays, LayoutTemplate, Route } from "lucide-react";
import { JournalCardio, JournalDay, JournalWeek, JournalWorkout } from "@/components/journal";
import { Reveal } from "@/components/reveal";
import { WeekStrip } from "@/components/week-strip";
import { ProgramCard } from "@/components/program-card";
import { NewProgramButton } from "@/components/programs";
import { listPrograms } from "@/lib/programs";
import { PlannedCard, WorkoutList, WorkoutRow } from "@/components/workout/workout-row";
import Link from "next/link";
import { CardioForm } from "@/components/cardio/cardio-form";
import { Disclosure, Empty, PageHeader, PageSkeleton, SectionTitle, Segmented } from "@/components/ui";
import { mark, type DayMark } from "@/lib/calendar-logic";
import { listCardio, type CardioSession } from "@/lib/cardio";
import { journalWeeks, weekTitle, type JournalWeek as Week } from "@/lib/journal";
import { normalizeProfile } from "@/lib/profile";
import { addDays, dayOf, fmtDuration, fmtNum, plural, weekStart } from "@/lib/format";
import { getAiState } from "@/lib/ai";
import { getUser } from "@/lib/auth";
import { listWorkouts, type WorkoutListItem } from "@/lib/workouts";

export const metadata = { title: "Тренування" };

const HEADER_LINKS = (
  <span className="flex gap-4">
    <Link href="/calendar" className="text-accent">
      Календар →
    </Link>
    <Link href="/exercises" className="text-accent">
      Бібліотека вправ →
    </Link>
  </span>
);

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

  // The strip on top: six weeks back, two ahead — what was done and what is planned, day by day.
  const WEEKS_BACK = 6;
  const monday = weekStart(today);
  const marks: Record<string, DayMark> = {};
  for (const w of history) if (w.startedAt) mark(marks, dayOf(w.startedAt), "done");
  for (const w of planned) if (w.scheduledFor) mark(marks, w.scheduledFor, "planned");
  for (const c of cardioAll) if (!c.workoutId) mark(marks, dayOf(c.startAt), "cardio", c.kind);
  const stripWeeks = Array.from({ length: WEEKS_BACK + 3 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(monday, (w - WEEKS_BACK) * 7 + d)));

  // The journal: strength workouts and cardio sessions together, week by week, filtered by kind.
  const entries: Entry[] = [
    ...(type === "cardio" ? [] : history).flatMap((w) => (w.startedAt ? [{ kind: "strength" as const, day: dayOf(w.startedAt), at: w.startedAt.getTime(), w }] : [])),
    ...(type === "strength" ? [] : cardioAll).map((s) => ({ kind: "cardio" as const, day: dayOf(s.startAt), at: s.startAt.getTime(), s })),
  ];
  const weeks = journalWeeks(entries);

  return (
    <>
      <PageHeader
        title="Тренування"
        subtitle={HEADER_LINKS}
        actions={<NewWorkoutButtons ai={Boolean(ai)} />}
      />
      <div className="space-y-8">
        <WeekStrip weeks={stripWeeks} today={today} current={WEEKS_BACK} marks={marks} />
        {active.length > 0 && (
          <Section title="Зараз триває">
            {active.map((w) => (
              <WorkoutRow key={w.id} w={w} />
            ))}
          </Section>
        )}
        {/* Nothing ahead yet: one line instead of empty boxes. */}
        {active.length + planned.length + currentPrograms.length === 0 && (
          <p className="text-sm text-muted">Заплановані тренування й програми зʼявляться тут — додайте їх кнопками «Запланувати» або «Створити».</p>
        )}
        {/* Ahead: outlined date cards — they never look like something already done. */}
        {planned.length > 0 && (
          <section>
            <SectionTitle>
              <span className="flex items-center gap-2">
                <CalendarDays size={20} className="text-accent" /> Заплановані
                <span className="text-base font-medium text-muted">{planned.length}</span>
              </span>
            </SectionTitle>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Reveal first={2} step={8} more="Показати решту" moreClass="col-span-full">
                {planned.map((w) => (
                  <PlannedCard key={w.id} w={w} sick={sick} />
                ))}
              </Reveal>
            </div>
          </section>
        )}
        {/* Programmes: stages the planned workouts belong to. */}
        {currentPrograms.length + pastPrograms.length > 0 && (
          <section>
            <SectionTitle action={<NewProgramButton ai={Boolean(ai)} />}>
              <span className="flex items-center gap-2">
                <Route size={20} className="text-accent" /> Програми
              </span>
            </SectionTitle>
            {currentPrograms.length > 0 && (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {currentPrograms.map((p) => (
                  <ProgramCard key={p.id} p={p} today={today} />
                ))}
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
        )}

        {/* Behind: the journal — week by week, a line of days with what was done on each. */}
        <section className="border-t border-line pt-7">
          <SectionTitle>
            <span className="flex items-center gap-2">
              <BookOpen size={20} className="text-muted" /> Журнал
              {entries.length > 0 && <span className="text-base font-medium text-muted">{entries.length}</span>}
            </span>
          </SectionTitle>
          <div className="mb-4">
            <Segmented options={TYPES} current={type} param="t" label="Вид тренувань" />
          </div>
          {weeks.length === 0 ? (
            <Empty>{type === "cardio" ? "Кардіо ще немає: запишіть «Біг» чи «Велосипед» на Apple Watch або додайте вручну нижче." : "Ще немає завершених тренувань."}</Empty>
          ) : (
            <div className="space-y-8 lg:max-w-3xl">
              <Reveal first={3} step={4} more="Раніші тижні">
                {weeks.map((week) => (
                  <JournalWeek key={week.monday} title={weekTitle(week.monday, today)} stats={weekStats(week)}>
                    {week.days.map(({ day, entries: list }) => (
                      <JournalDay key={day} day={day} today={today}>
                        {list.map((e) => (e.kind === "strength" ? <JournalWorkout key={e.w.id} w={e.w} /> : <JournalCardio key={e.s.id} s={e.s} />))}
                      </JournalDay>
                    ))}
                  </JournalWeek>
                ))}
              </Reveal>
            </div>
          )}
          {type !== "strength" && (
            <div className="mt-5">
              <Disclosure title="Додати кардіо вручну" hint="Якщо пробіжку чи заїзд не записав годинник">
                <CardioForm today={dayOf()} />
              </Disclosure>
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
      </div>
    </>
  );
}

type Entry = { kind: "strength"; day: string; at: number; w: WorkoutListItem } | { kind: "cardio"; day: string; at: number; s: CardioSession };

/** A week in a few numbers: sessions, time, weight moved, distance covered. */
function weekStats(week: Week<Entry>): string[] {
  const all = week.days.flatMap((d) => d.entries);
  let sec = 0;
  let kg = 0;
  let km = 0;
  for (const e of all) {
    if (e.kind === "strength") {
      if (e.w.startedAt && e.w.endedAt) sec += Math.max(0, (e.w.endedAt.getTime() - e.w.startedAt.getTime()) / 1000 - e.w.pausedSec);
      kg += e.w.volume;
    } else {
      sec += e.s.durationSec;
      km += (e.s.distanceM ?? 0) / 1000;
    }
  }
  return [plural(all.length, ["тренування", "тренування", "тренувань"]), sec > 0 && fmtDuration(sec), kg > 0 && `${fmtNum(kg)} кг`, km >= 0.1 && `${fmtNum(km, 1)} км`].filter((x): x is string => Boolean(x));
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
    <Suspense
      fallback={<PageSkeleton title="Тренування" subtitle={HEADER_LINKS} />}
    >
      <Content {...props} />
    </Suspense>
  );
}
