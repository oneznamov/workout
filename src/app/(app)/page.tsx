import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { Check, Dumbbell, Flame, Footprints, Heart, Moon, Play, Scale, Timer, Weight, Activity } from "lucide-react";
import { CoachCard } from "@/components/ai";
import { CardioRow } from "@/components/cardio/cardio-row";
import { StackedBars } from "@/components/charts";
import { DashboardCustomizer } from "@/components/dashboard-customizer";
import { Leaderboard } from "@/components/friends";
import { GoalsCard } from "@/components/goals-card";
import { MuscleWeekCard } from "@/components/muscles/muscle-balance";
import { Card, Empty, PageSkeleton, SectionTitle, Stat } from "@/components/ui";
import { WeightQuick } from "@/components/weight-quick";
import { NewWorkoutButtons } from "@/components/workout/new-workout";
import { WorkoutRow } from "@/components/workout/workout-row";
import { getAiState, getCoachNote } from "@/lib/ai";
import { getMuscleBalance, getWeekSummary } from "@/lib/analytics";
import { getUser } from "@/lib/auth";
import { listCardio } from "@/lib/cardio";
import { CARDIO_COLOR } from "@/lib/cardio-kinds";
import { resolveDashboard, type WidgetId } from "@/lib/dashboard";
import { addDays, cx, dayOf, EXERCISES_FORMS, fmtDate, fmtDateLong, fmtDuration, fmtNum, fmtTime, plural, weekStart } from "@/lib/format";
import { getLeaderboard } from "@/lib/friends";
import { normalizeGoals } from "@/lib/goals";
import { getMetricSeries } from "@/lib/health";
import { BODY_MUSCLES, TARGET_MIN } from "@/lib/muscles";
import { listWorkouts } from "@/lib/workouts";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

async function Content() {
  const user = await getUser();
  const today = dayOf();
  const monday = weekStart(today);
  const widgets = resolveDashboard(user.dashboard);
  const on = (id: WidgetId) => widgets.some((w) => w.id === id && w.visible);

  const [active, planned, recent, week, weights, muscles, cardio, vitals, board, ai, coach] = await Promise.all([
    listWorkouts(user.id, { status: "in_progress", limit: 1 }),
    listWorkouts(user.id, { status: "planned", limit: 50 }),
    listWorkouts(user.id, { status: "completed", limit: 20 }),
    getWeekSummary(user.id),
    on("weight") ? getMetricSeries(user.id, ["body_mass"], addDays(today, -120)) : [],
    on("muscles") || on("goals") ? getMuscleBalance(user.id, 1) : null,
    listCardio(user.id, { from: addDays(monday, -21) }),
    on("vitals")
      ? getMetricSeries(user.id, ["resting_heart_rate", "heart_rate_variability", "sleep_analysis", "step_count"], addDays(today, -14))
      : [],
    on("friends") ? getLeaderboard(user.id, "week") : [],
    on("coach") ? getAiState(user.id) : null,
    on("coach") ? getCoachNote(user.id) : null,
  ]);

  const upcoming = planned
    .filter((w) => !w.scheduledFor || w.scheduledFor >= today)
    .sort((a, b) => (a.scheduledFor ?? "9999").localeCompare(b.scheduledFor ?? "9999"));
  const todays = upcoming.find((w) => w.scheduledFor === today);
  const doneDays = new Set(recent.filter((w) => w.startedAt).map((w) => dayOf(w.startedAt!)));
  const plannedDays = new Set(planned.map((w) => w.scheduledFor).filter(Boolean));
  const weekCardio = cardio.filter((c) => dayOf(c.startAt) >= monday);
  const cardioByDay = new Map<string, string>();
  for (const c of weekCardio) if (!cardioByDay.has(dayOf(c.startAt))) cardioByDay.set(dayOf(c.startAt), CARDIO_COLOR[c.kind]);
  const cardioKm = weekCardio.reduce((a, c) => a + (c.distanceM ?? 0), 0) / 1000;
  const cardioMin = weekCardio.reduce((a, c) => a + c.durationSec, 0) / 60;
  const gymMinByDay = new Map<string, number>();
  for (const w of recent) {
    if (!w.startedAt || !w.endedAt) continue;
    const d = dayOf(w.startedAt);
    gymMinByDay.set(d, (gymMinByDay.get(d) ?? 0) + Math.max(0, Math.round((w.endedAt.getTime() - w.startedAt.getTime()) / 60000 - w.pausedSec / 60)));
  }
  const cardioMinByDay = new Map<string, number>();
  for (const c of weekCardio) cardioMinByDay.set(dayOf(c.startAt), (cardioMinByDay.get(dayOf(c.startAt)) ?? 0) + Math.round(c.durationSec / 60));
  const musclesInNorm = muscles
    ? BODY_MUSCLES.filter((m) => muscles.contributions.filter((c) => c.muscle === m).reduce((a, c) => a + c.sets, 0) >= TARGET_MIN).length
    : 0;
  const delta = (cur: number, prev: number) =>
    prev > 0 ? `${cur >= prev ? "+" : "−"}${fmtNum(Math.abs(((cur - prev) / prev) * 100))}% до минулого` : "цього тижня";
  const latest = (metric: string) => vitals.filter((v) => v.metric === metric).at(-1);

  const blocks: Record<WidgetId, ReactNode> = {
    goals: (
      <GoalsCard
        goals={normalizeGoals(user.goals)}
        values={{ workouts: week.cur.workouts, cardioMin: Math.round(cardioMin), muscles: musclesInNorm }}
      />
    ),
    minutes: (
      <Card title="Хвилини по днях">
        <StackedBars
          unit="хв"
          height={132}
          series={[
            { label: "Силові", color: "var(--c-strength)" },
            { label: "Кардіо", color: "var(--c-run)" },
          ]}
          data={WEEKDAYS.map((label, i) => {
            const d = addDays(monday, i);
            return { label, hint: fmtDate(d, { weekday: "long", day: "numeric", month: "long" }), values: [gymMinByDay.get(d) ?? 0, cardioMinByDay.get(d) ?? 0] };
          })}
        />
      </Card>
    ),
    week: (
      <div className="card grid grid-cols-7 gap-1 p-3">
        {WEEKDAYS.map((label, i) => {
          const day = addDays(monday, i);
          const done = doneDays.has(day);
          const plan = plannedDays.has(day);
          return (
            <div
              key={day}
              className="flex flex-col items-center gap-1.5"
              aria-label={`${fmtDate(day)}: ${done ? "силове виконано" : plan ? "заплановано" : "без силового"}${cardioByDay.has(day) ? ", було кардіо" : ""}`}
            >
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
              <span className="size-1.5 rounded-full" style={{ background: cardioByDay.get(day) ?? "transparent" }} />
            </div>
          );
        })}
      </div>
    ),
    stats: (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Тренувань" tone="text-strength" icon={<Dumbbell size={15} />} value={week.cur.workouts} hint={`минулого тижня: ${week.prev.workouts}`} />
        <Stat label="Час у залі" tone="text-activity" icon={<Timer size={15} />} value={fmtDuration(week.cur.durationMin * 60)} hint={`минулого: ${fmtDuration(week.prev.durationMin * 60)}`} />
        <Stat label="Тоннаж" tone="text-strength" icon={<Weight size={15} />} value={fmtNum(week.cur.volume)} unit="кг" hint={delta(week.cur.volume, week.prev.volume)} />
        <Stat
          label="Кардіо"
          tone="text-run"
          icon={<Flame size={15} />}
          value={cardioKm > 0 ? fmtNum(cardioKm, 1) : fmtNum(cardioMin)}
          unit={cardioKm > 0 ? "км" : "хв"}
          hint={weekCardio.length ? `${weekCardio.length} сесій · ${fmtNum(cardioMin)} хв` : "цього тижня ще не було"}
        />
      </div>
    ),
    weight: (
      <Card title="Вага тіла" tone="text-body" icon={<Scale size={16} />} action={<Link href="/health" className="text-xs text-accent">Усі записи →</Link>}>
        <WeightQuick today={today} points={weights.map((w) => ({ day: w.day, value: w.value }))} />
      </Card>
    ),
    muscles: muscles ? (
      <Card title="Мʼязи цього тижня">
        <MuscleWeekCard data={muscles} />
      </Card>
    ) : null,
    plan: (
      <section>
        <SectionTitle action={<Link href="/workouts" className="text-sm text-accent">Усі</Link>}>За планом</SectionTitle>
        <div className="grid gap-3 lg:grid-cols-2">
          {upcoming.length ? upcoming.slice(0, 4).map((w) => <WorkoutRow key={w.id} w={w} />) : <Empty>Запланованих тренувань немає.</Empty>}
        </div>
      </section>
    ),
    recent: (
      <section>
        <SectionTitle action={<Link href="/workouts" className="text-sm text-accent">Усі</Link>}>Останні тренування</SectionTitle>
        <div className="grid gap-3 lg:grid-cols-2">
          {recent.length ? recent.slice(0, 4).map((w) => <WorkoutRow key={w.id} w={w} />) : <Empty>Ще немає завершених тренувань.</Empty>}
        </div>
      </section>
    ),
    // Only with an AI key connected; without one the widget simply is not there.
    coach: ai ? <CoachCard initial={coach} auto={ai.auto} /> : null,
    friends:
      board.length > 1 ? (
        <Card title="Друзі цього тижня" action={<Link href="/friends" className="text-xs text-accent">Рейтинг →</Link>}>
          <Leaderboard rows={board} compact />
        </Card>
      ) : (
        <Link href="/friends" className="card flex h-full items-center justify-between gap-3 p-4 hover:bg-surface-2">
          <span>
            <span className="block text-[15px] font-semibold">Змагайтесь із друзями</span>
            <span className="block text-xs text-muted">Додайте друга за посиланням — зʼявиться рейтинг тижня</span>
          </span>
          <span className="text-accent">→</span>
        </Link>
      ),
    cardio: (
      <section>
        <SectionTitle action={<Link href="/cardio" className="text-sm text-accent">Усе</Link>}>Останнє кардіо</SectionTitle>
        <div className="grid gap-3 lg:grid-cols-2">
          {cardio.length ? cardio.slice(0, 2).map((c) => <CardioRow key={c.id} s={c} />) : <Empty>Пробіжок і заїздів ще немає.</Empty>}
        </div>
      </section>
    ),
    vitals: (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Пульс спокою" tone="text-heart" icon={<Heart size={15} />} value={fmtNum(latest("resting_heart_rate")?.value)} unit="уд/хв" hint={latest("resting_heart_rate") ? fmtDate(latest("resting_heart_rate")!.day) : "немає даних"} />
        <Stat label="HRV" tone="text-heart" icon={<Activity size={15} />} value={fmtNum(latest("heart_rate_variability")?.value)} unit="мс" hint={latest("heart_rate_variability") ? fmtDate(latest("heart_rate_variability")!.day) : "немає даних"} />
        <Stat label="Сон" tone="text-sleep" icon={<Moon size={15} />} value={fmtNum(latest("sleep_analysis")?.value, 1)} unit="год" hint={latest("sleep_analysis") ? fmtDate(latest("sleep_analysis")!.day) : "немає даних"} />
        <Stat label="Кроки" tone="text-activity" icon={<Footprints size={15} />} value={fmtNum(latest("step_count")?.value)} hint={latest("step_count") ? fmtDate(latest("step_count")!.day) : "немає даних"} />
      </div>
    ),
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="caps first-letter:uppercase">{fmtDateLong(new Date())}</p>
        <h1 className="truncate text-[2rem] leading-tight font-bold tracking-tight">Привіт, {user.username.split("@")[0]}</h1>
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
        <NewWorkoutButtons compact />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {widgets
          .filter((w) => w.visible && blocks[w.id])
          .map((w) => (
            <div key={w.id} className={cx("min-w-0", w.wide && "lg:col-span-2")}>
              {blocks[w.id]}
            </div>
          ))}
      </div>

      <DashboardCustomizer widgets={widgets.map(({ id, label, visible, wide }) => ({ id, label, visible, wide }))} />
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
