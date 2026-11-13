import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RevisionList } from "@/components/program-card";
import { GoalBar } from "@/components/profile";
import { ProgramActions } from "@/components/programs";
import { Card, PageSkeleton } from "@/components/ui";
import { WorkoutRow } from "@/components/workout/workout-row";
import { getAiState } from "@/lib/ai";
import { getUser } from "@/lib/auth";
import { cx, dayOf, fmtDate, plural } from "@/lib/format";
import { goalProgress } from "@/lib/goal-progress";
import { linkedGoals, normalizeProfile } from "@/lib/profile";
import { PROGRAM_STATUS_LABEL, programStatus, programWeek, programWeeks } from "@/lib/program-logic";
import { getProgram } from "@/lib/programs";
import { listWorkouts, NotFoundError } from "@/lib/workouts";

export const metadata = { title: "Програма" };
const WEEK_FORMS: [string, string, string] = ["тиждень", "тижні", "тижнів"];

async function Content({ params }: PageProps<"/programs/[id]">) {
  const { id } = await params;
  const user = await getUser();
  const program = await getProgram(user.id, id).catch((e) => {
    if (e instanceof NotFoundError || /uuid/i.test(String(e?.cause?.message ?? e?.message))) notFound();
    throw e;
  });
  const [items, ai] = await Promise.all([listWorkouts(user.id, { programId: id, limit: 200 }), getAiState(user.id)]);
  const today = dayOf();
  const profile = normalizeProfile(user.profile);
  const sick = Boolean(profile.sick);
  // What the programme is for: the athlete's goals it is tied to, each with its progress so far.
  const goals = linkedGoals(profile.goals, program.goalIds);
  const progress = goals.some((g) => g.metric) ? await goalProgress(user.id, { ...profile, goals }) : {};
  const status = programStatus(program, today);
  const dayOfWorkout = (w: (typeof items)[number]) => (w.startedAt ? dayOf(w.startedAt) : (w.scheduledFor ?? program.endsOn));
  const list = items.filter((w) => w.status !== "template").sort((a, b) => dayOfWorkout(a).localeCompare(dayOfWorkout(b)));
  const done = list.filter((w) => w.status === "completed").length;
  const pct = list.length ? Math.round((done / list.length) * 100) : 0;
  // Workouts grouped by the programme's weeks.
  const weeks = new Map<number, typeof list>();
  for (const w of list) {
    const n = programWeek(program.startsOn, dayOfWorkout(w));
    weeks.set(n, [...(weeks.get(n) ?? []), w]);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/workouts" className="text-sm text-accent">
          ← Тренування
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[2rem] leading-tight font-bold tracking-tight">{program.name}</h1>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status === "active" ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2"}`}>{PROGRAM_STATUS_LABEL[status]}</span>
        </div>
        <p className="text-sm text-muted">
          {fmtDate(program.startsOn, { day: "numeric", month: "long" })} – {fmtDate(program.endsOn, { day: "numeric", month: "long", year: "numeric" })} · {plural(programWeeks(program), WEEK_FORMS)}
          {status === "active" && ` · зараз ${programWeek(program.startsOn, today)}-й`}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <div className="space-y-5">
          <Card title="Прогрес">
            <div className="num text-[1.75rem] leading-none font-semibold">
              {done}
              <span className="text-muted"> з {list.length}</span>
              <span className="ml-2 text-sm font-medium text-muted">тренувань · {pct}%</span>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
          </Card>
          <Card
            title="Цілі програми"
            action={
              <Link href="/profile" className="text-xs text-accent">
                Усі цілі →
              </Link>
            }
          >
            {goals.length > 0 ? (
              <ul className="space-y-3.5">
                {goals.map((g) => (
                  <li key={g.id} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={cx("min-w-0 text-[15px] font-semibold", g.done && "text-muted line-through")}>{g.title}</span>
                      {g.done ? <span className="shrink-0 text-xs font-semibold text-good">досягнуто</span> : g.targetDate && <span className="shrink-0 text-xs text-muted">до {fmtDate(g.targetDate)}</span>}
                    </div>
                    {g.details && <p className="text-sm text-ink-2">{g.details}</p>}
                    <GoalBar goal={g} progress={progress[g.id]} />
                    {(!g.metric || g.target == null) && !g.done && <p className="text-xs text-muted">Без числа прогрес не рахується — додайте його в Профілі.</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Програма ще не привʼязана до цілей. Позначте їх у «Змінити програму» → редагування.</p>
            )}
          </Card>
          {program.description && (
            <Card title="Примітки">
              <p className="text-[15px] leading-relaxed whitespace-pre-line text-ink-2">{program.description}</p>
            </Card>
          )}
          {program.forecast && (
            <Card title="Прогноз на кінець програми" tone="text-activity">
              <p className="text-[15px] leading-relaxed whitespace-pre-line text-ink-2">{program.forecast}</p>
            </Card>
          )}
          <Card title="Змінити програму">
            <ProgramActions
              id={program.id}
              ai={Boolean(ai)}
              initial={{ name: program.name, description: program.description, forecast: program.forecast, goalIds: program.goalIds, startsOn: program.startsOn, endsOn: program.endsOn }}
            />
          </Card>
          <Card title="Історія змін">
            <RevisionList revisions={program.revisions} />
          </Card>
        </div>

        <div className="space-y-5">
          {list.length === 0 && <p className="card p-6 text-center text-sm text-muted">У програмі ще немає тренувань. Додайте перше або попросіть ШІ оновити програму.</p>}
          {[...weeks].map(([n, group]) => (
            <section key={n}>
              <h2 className="caps mb-2 px-1">
                Тиждень {n}
                {status === "active" && n === programWeek(program.startsOn, today) && <span className="ml-2 text-accent">зараз</span>}
              </h2>
              <div className="grid gap-3">
                {group.map((w) => (
                  <WorkoutRow key={w.id} w={w} sick={sick} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Page(props: PageProps<"/programs/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content {...props} />
    </Suspense>
  );
}
