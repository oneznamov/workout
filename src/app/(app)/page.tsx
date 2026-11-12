import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui";
import Link from "next/link";
import { Play, Settings } from "lucide-react";
import { NewWorkoutButtons } from "@/components/workout/new-workout";
import { WorkoutRow } from "@/components/workout/workout-row";
import { Card, Empty, Stat } from "@/components/ui";
import { MuscleWeekCard } from "@/components/muscles/muscle-balance";
import { getMuscleBalance, getWeekSummary } from "@/lib/analytics";
import { getUser } from "@/lib/auth";
import { addDays, dayOf, fmtDate, fmtDateLong, fmtDuration, fmtNum, fmtTime } from "@/lib/format";
import { getMetricSeries } from "@/lib/health";
import { listWorkouts } from "@/lib/workouts";

async function Content() {
  const user = await getUser();
  const today = dayOf();
  const [active, planned, recent, week, metrics, muscles] = await Promise.all([
    listWorkouts(user.id, { status: "in_progress", limit: 1 }),
    listWorkouts(user.id, { status: "planned", limit: 50 }),
    listWorkouts(user.id, { status: "completed", limit: 5 }),
    getWeekSummary(user.id),
    getMetricSeries(user.id, ["body_mass", "resting_heart_rate", "heart_rate_variability"], addDays(today, -60)),
    getMuscleBalance(user.id, 1),
  ]);
  const upcoming = planned
    .filter((w) => !w.scheduledFor || w.scheduledFor >= today)
    .sort((a, b) => (a.scheduledFor ?? "9999").localeCompare(b.scheduledFor ?? "9999"))
    .slice(0, 3);
  const latest = (metric: string) => metrics.filter((m) => m.metric === metric).at(-1);
  const weight = latest("body_mass");
  const rhr = latest("resting_heart_rate");
  const delta = (cur: number, prev: number) =>
    prev > 0 ? `${cur >= prev ? "+" : "−"}${fmtNum(Math.abs(((cur - prev) / prev) * 100))}% до мин. тижня` : "цього тижня";

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted first-letter:uppercase">{fmtDateLong(new Date())}</p>
          <h1 className="text-2xl font-semibold">Привіт, {user.username}</h1>
        </div>
        <Link href="/settings" aria-label="Налаштування" className="grid size-10 place-items-center rounded-lg border border-line bg-surface md:hidden">
          <Settings size={18} />
        </Link>
      </header>

      {active[0] ? (
        <Link href={`/workouts/${active[0].id}`} className="flex items-center gap-4 rounded-2xl bg-accent p-5 text-white">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/20">
            <Play size={20} />
          </span>
          <span className="min-w-0">
            <span className="block text-xs opacity-80">Тренування триває · з {fmtTime(active[0].startedAt)}</span>
            <span className="block truncate text-lg font-semibold">{active[0].name}</span>
          </span>
          <span className="ml-auto text-sm font-medium">Продовжити →</span>
        </Link>
      ) : (
        <Card title="Нове тренування">
          <NewWorkoutButtons compact />
        </Card>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium text-ink-2">Найближчі за планом</h2>
        <div className="grid gap-2 lg:grid-cols-2">
          {upcoming.length ? (
            upcoming.map((w) => <WorkoutRow key={w.id} w={w} />)
          ) : (
            <Empty>План порожній. Попросіть Claude скласти тренування або заплануйте самі.</Empty>
          )}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Тренувань за тиждень" value={week.cur.workouts} hint={`минулого: ${week.prev.workouts}`} />
        <Stat label="Час у залі" value={fmtDuration(week.cur.durationMin * 60)} hint={`минулого: ${fmtDuration(week.prev.durationMin * 60)}`} />
        <Stat label="Тоннаж" value={fmtNum(week.cur.volume)} unit="кг" hint={delta(week.cur.volume, week.prev.volume)} />
        {weight ? (
          <Stat label="Вага тіла" value={fmtNum(weight.value, 1)} unit="кг" hint={fmtDate(weight.day)} />
        ) : rhr ? (
          <Stat label="Пульс спокою" value={fmtNum(rhr.value)} unit="уд/хв" hint={fmtDate(rhr.day)} />
        ) : (
          <Stat label="Підходів за тиждень" value={week.cur.sets} hint={`минулого: ${week.prev.sets}`} />
        )}
      </section>

      <Card title="Мʼязи цього тижня">
        <MuscleWeekCard data={muscles} />
      </Card>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink-2">Останні тренування</h2>
          <Link href="/workouts" className="text-xs text-accent">
            Усі →
          </Link>
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          {recent.length ? recent.map((w) => <WorkoutRow key={w.id} w={w} />) : <Empty>Ще немає завершених тренувань.</Empty>}
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
