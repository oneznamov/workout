import { Suspense } from "react";
import Link from "next/link";
import { Check, Play } from "lucide-react";
import { MuscleWeekCard } from "@/components/muscles/muscle-balance";
import { Card, Empty, PageSkeleton, SectionTitle, Stat } from "@/components/ui";
import { WeightQuick } from "@/components/weight-quick";
import { NewWorkoutButtons } from "@/components/workout/new-workout";
import { WorkoutRow } from "@/components/workout/workout-row";
import { getMuscleBalance, getWeekSummary } from "@/lib/analytics";
import { getUser } from "@/lib/auth";
import { addDays, cx, dayOf, EXERCISES_FORMS, fmtDate, fmtDateLong, fmtDuration, fmtNum, fmtTime, plural, weekStart } from "@/lib/format";
import { getMetricSeries } from "@/lib/health";
import { listWorkouts } from "@/lib/workouts";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

async function Content() {
  const user = await getUser();
  const today = dayOf();
  const monday = weekStart(today);
  const [active, planned, recent, week, weights, muscles] = await Promise.all([
    listWorkouts(user.id, { status: "in_progress", limit: 1 }),
    listWorkouts(user.id, { status: "planned", limit: 50 }),
    listWorkouts(user.id, { status: "completed", limit: 20 }),
    getWeekSummary(user.id),
    getMetricSeries(user.id, ["body_mass"], addDays(today, -120)),
    getMuscleBalance(user.id, 1),
  ]);
  const upcoming = planned
    .filter((w) => !w.scheduledFor || w.scheduledFor >= today)
    .sort((a, b) => (a.scheduledFor ?? "9999").localeCompare(b.scheduledFor ?? "9999"));
  const todays = upcoming.find((w) => w.scheduledFor === today);
  const doneDays = new Set(recent.filter((w) => w.startedAt).map((w) => dayOf(w.startedAt!)));
  const plannedDays = new Set(planned.map((w) => w.scheduledFor).filter(Boolean));
  const delta = (cur: number, prev: number) =>
    prev > 0 ? `${cur >= prev ? "+" : "−"}${fmtNum(Math.abs(((cur - prev) / prev) * 100))}% до минулого` : "цього тижня";

  return (
    <div className="space-y-7">
      <header>
        <p className="caps first-letter:uppercase">{fmtDateLong(new Date())}</p>
        <h1 className="text-[2rem] leading-tight font-bold tracking-tight">Привіт, {user.username}</h1>
      </header>

      {active[0] ? (
        <Link href={`/workouts/${active[0].id}`} className="flex items-center gap-4 rounded-[20px] bg-accent p-5 text-accent-ink">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-black/15">
            <Play size={22} fill="currentColor" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold tracking-wide uppercase opacity-70">Триває · з {fmtTime(active[0].startedAt)}</span>
            <span className="block truncate text-xl font-bold">{active[0].name}</span>
          </span>
          <span className="shrink-0 text-sm font-semibold">Продовжити →</span>
        </Link>
      ) : todays ? (
        <Link href={`/workouts/${todays.id}`} className="card flex items-center gap-4 p-5 hover:bg-surface-2">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
            <Play size={22} fill="currentColor" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="caps block text-accent">Сьогодні за планом</span>
            <span className="block truncate text-xl font-bold">{todays.name}</span>
            <span className="block text-xs text-muted">{plural(todays.exerciseCount, EXERCISES_FORMS)}</span>
          </span>
          <span className="shrink-0 text-sm font-semibold text-accent">Відкрити →</span>
        </Link>
      ) : (
        <Card title="Нове тренування">
          <NewWorkoutButtons compact />
        </Card>
      )}

      <section>
        <SectionTitle>Цей тиждень</SectionTitle>
        <div className="card mb-3 grid grid-cols-7 gap-1 p-3">
          {WEEKDAYS.map((label, i) => {
            const day = addDays(monday, i);
            const done = doneDays.has(day);
            const plan = plannedDays.has(day);
            return (
              <div key={day} className="flex flex-col items-center gap-1.5" aria-label={`${fmtDate(day)}: ${done ? "тренування виконано" : plan ? "заплановано" : "без тренування"}`}>
                <span className={cx("text-[11px] font-semibold", day === today ? "text-accent" : "text-muted")}>{label}</span>
                <span
                  className={cx(
                    "num grid size-9 place-items-center rounded-full text-sm font-semibold",
                    done ? "bg-accent text-accent-ink" : plan ? "text-ink ring-2 ring-accent/60" : "bg-surface-2 text-muted",
                    day === today && !done && "text-ink",
                  )}
                >
                  {done ? <Check size={17} strokeWidth={3} /> : Number(day.slice(8))}
                </span>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Тренувань" tone="text-strength" value={week.cur.workouts} hint={`минулого тижня: ${week.prev.workouts}`} />
          <Stat label="Час у залі" tone="text-activity" value={fmtDuration(week.cur.durationMin * 60)} hint={`минулого: ${fmtDuration(week.prev.durationMin * 60)}`} />
          <Stat label="Тоннаж" tone="text-strength" value={fmtNum(week.cur.volume)} unit="кг" hint={delta(week.cur.volume, week.prev.volume)} />
          <Stat label="Підходів" tone="text-strength" value={week.cur.sets} hint={`минулого тижня: ${week.prev.sets}`} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Вага тіла" tone="text-body" action={<Link href="/health" className="text-xs text-accent">Усі записи →</Link>}>
          <WeightQuick today={today} points={weights.map((w) => ({ day: w.day, value: w.value }))} />
        </Card>
        <Card title="Мʼязи цього тижня">
          <MuscleWeekCard data={muscles} />
        </Card>
      </div>

      {upcoming.length > 0 && (
        <section>
          <SectionTitle action={<Link href="/workouts" className="text-sm text-accent">Усі</Link>}>За планом</SectionTitle>
          <div className="grid gap-3 lg:grid-cols-2">
            {upcoming.slice(0, 4).map((w) => (
              <WorkoutRow key={w.id} w={w} />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle action={<Link href="/workouts" className="text-sm text-accent">Усі</Link>}>Останні тренування</SectionTitle>
        <div className="grid gap-3 lg:grid-cols-2">
          {recent.length ? recent.slice(0, 4).map((w) => <WorkoutRow key={w.id} w={w} />) : <Empty>Ще немає завершених тренувань.</Empty>}
        </div>
      </section>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}
