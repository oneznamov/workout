import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { Dumbbell, Flame, Footprints, Heart, Moon, Play, Scale, Timer, Weight, Activity } from "lucide-react";
import { CoachCard } from "@/components/ai";
import { Avatar } from "@/components/avatar";
import { CardioRow } from "@/components/cardio/cardio-row";
import { StackedBars } from "@/components/charts";
import { DashboardCustomizer } from "@/components/dashboard-customizer";
import { Leaderboard } from "@/components/team";
import { GoalsCard } from "@/components/goals-card";
import { MuscleWeekCard } from "@/components/muscles/muscle-balance";
import { Card, Empty, PageSkeleton, SectionTitle, Stat } from "@/components/ui";
import { WeekStrip } from "@/components/week-strip";
import { WeightQuick } from "@/components/weight-quick";
import { GoalBar, SickMode } from "@/components/profile";
import { ReadinessNote } from "@/components/readiness";
import { NewWorkoutButtons } from "@/components/workout/new-workout";
import { WorkoutRow } from "@/components/workout/workout-row";
import { getAiState, getCoachNote } from "@/lib/ai";
import { getMuscleBalance, getWeekSummary } from "@/lib/analytics";
import { getUser } from "@/lib/auth";
import { mark, type DayMark } from "@/lib/calendar-logic";
import { listCardio } from "@/lib/cardio";
import { CARDIO_COLOR } from "@/lib/cardio-kinds";
import { resolveDashboard, type WidgetId } from "@/lib/dashboard";
import { addDays, cx, dayOf, durationParts, EXERCISES_FORMS, fmtDate, fmtDateLong, fmtDuration, fmtNum, fmtTime, plural, weekStart } from "@/lib/format";
import { getLeaderboard, listMyTeamInvites } from "@/lib/team";
import { normalizeGoals } from "@/lib/goals";
import { getMetricSeries } from "@/lib/health";
import { goalProgress } from "@/lib/goal-progress";
import { normalizeProfile, personName, photoUrl } from "@/lib/profile";
import { updateRequest } from "@/lib/readiness";
import { getReadiness } from "@/lib/recovery";
import { BODY_MUSCLES, TARGET_MIN } from "@/lib/muscles";
import { listWorkouts } from "@/lib/workouts";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

async function Content() {
  const user = await getUser();
  const today = dayOf();
  const monday = weekStart(today);
  const widgets = resolveDashboard(user.dashboard);
  const on = (id: WidgetId) => widgets.some((w) => w.id === id && w.visible);
  const profile = normalizeProfile(user.profile);

  const [active, planned, recent, week, weights, muscles, cardio, vitals, board, ai, coach, teamInvites, progress, aiState, ready] = await Promise.all([
    listWorkouts(user.id, { status: "in_progress", limit: 1 }),
    listWorkouts(user.id, { status: "planned", limit: 50 }),
    listWorkouts(user.id, { status: "completed", limit: 40 }),
    getWeekSummary(user.id),
    on("weight") ? getMetricSeries(user.id, ["body_mass"], addDays(today, -120)) : [],
    on("muscles") || on("goals") ? getMuscleBalance(user.id, 1) : null,
    listCardio(user.id, { from: addDays(monday, -42) }),
    on("vitals")
      ? getMetricSeries(user.id, ["resting_heart_rate", "heart_rate_variability", "sleep_analysis", "step_count"], addDays(today, -14))
      : [],
    on("friends") ? getLeaderboard(user.id, "week") : [],
    on("coach") ? getAiState(user.id) : null,
    on("coach") ? getCoachNote(user.id) : null,
    listMyTeamInvites(user.id),
    on("mygoals") ? goalProgress(user.id, profile) : ({} as Awaited<ReturnType<typeof goalProgress>>),
    getAiState(user.id),
    getReadiness(user.id),
  ]);
  const aiConnected = Boolean(aiState);

  const upcoming = planned
    .filter((w) => !w.scheduledFor || w.scheduledFor >= today)
    .sort((a, b) => (a.scheduledFor ?? "9999").localeCompare(b.scheduledFor ?? "9999"));
  const todays = upcoming.find((w) => w.scheduledFor === today);
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

  // Six weeks back and two ahead for the week strip.
  const WEEKS_BACK = 6;
  // What is on each day: finished strength workouts, planned ones, cardio not already inside a workout.
  const marks: Record<string, DayMark> = {};
  for (const w of recent) if (w.startedAt) mark(marks, dayOf(w.startedAt), "done");
  for (const w of planned) if (w.scheduledFor) mark(marks, w.scheduledFor, "planned");
  for (const c of cardio) if (!c.workoutId) mark(marks, dayOf(c.startAt), "cardio", c.kind);
  const stripWeeks: string[][] = Array.from({ length: WEEKS_BACK + 3 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(monday, (w - WEEKS_BACK) * 7 + d)));
  const openGoals = profile.goals.filter((g) => !g.done);
  const overdue = planned.filter((w) => w.scheduledFor && w.scheduledFor < today).sort((a, b) => b.scheduledFor!.localeCompare(a.scheduledFor!));

  const blocks: Record<WidgetId, ReactNode> = {
    goals: (
      <GoalsCard
        goals={normalizeGoals(user.goals)}
        values={{ workouts: week.cur.workouts, cardioMin: Math.round(cardioMin), muscles: musclesInNorm }}
        ai={aiConnected}
        paused={Boolean(profile.sick)}
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
    week: <WeekStrip weeks={stripWeeks} today={today} current={WEEKS_BACK} marks={marks} />,
    mygoals: openGoals.length ? (
      <Card title="Мої цілі" action={<Link href="/profile" className="text-xs text-accent">Профіль →</Link>}>
        <ul className="space-y-3.5">
          {openGoals.slice(0, 4).map((g) => (
            <li key={g.id} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[15px] font-semibold">{g.title}</span>
                {g.targetDate && <span className="shrink-0 text-xs text-muted">до {fmtDate(g.targetDate)}</span>}
              </div>
              <GoalBar goal={g} progress={progress[g.id]} />
            </li>
          ))}
        </ul>
      </Card>
    ) : null,
    stats: (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Тренувань" tone="text-strength" icon={<Dumbbell size={15} />} value={week.cur.workouts} hint={`минулого тижня: ${week.prev.workouts}`} />
        <Stat label="Час у залі" tone="text-activity" icon={<Timer size={15} />} {...durationParts(week.cur.durationMin * 60)} hint={`минулого: ${fmtDuration(week.prev.durationMin * 60)}`} />
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
      <Card title="Вага тіла" tone="text-body" icon={<Scale size={16} />} action={<Link href="/profile" className="text-xs text-accent">Профіль →</Link>}>
        <WeightQuick today={today} points={weights.map((w) => ({ day: w.day, value: w.value }))} />
      </Card>
    ),
    muscles: muscles ? (
      <Card title="Мʼязи цього тижня">
        <MuscleWeekCard data={muscles} sex={profile.sex} />
      </Card>
    ) : null,
    plan: (
      <section>
        <SectionTitle action={<Link href="/workouts" className="text-sm text-accent">Усі</Link>}>За планом</SectionTitle>
        <div className="grid gap-3 lg:grid-cols-2">
          {overdue.length + upcoming.length ? (
            [...overdue.slice(0, 2), ...upcoming.slice(0, 4)].map((w) => <WorkoutRow key={w.id} w={w} sick={Boolean(profile.sick)} />)
          ) : (
            <Empty>Запланованих тренувань немає.</Empty>
          )}
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
        <Card title="Команда цього тижня" action={<Link href="/team" className="text-xs text-accent">Рейтинг →</Link>}>
          <Leaderboard rows={board} compact />
        </Card>
      ) : (
        <Link href="/team" className="card flex h-full items-center justify-between gap-3 p-4 hover:bg-surface-2">
          <span>
            <span className="block text-[15px] font-semibold">Зберіть команду</span>
            <span className="block text-xs text-muted">Запросіть когось із застосунку — зʼявиться рейтинг тижня</span>
          </span>
          <span className="text-accent">→</span>
        </Link>
      ),
    cardio: (
      <section>
        <SectionTitle action={<Link href="/workouts?t=cardio" className="text-sm text-accent">Усе</Link>}>Останнє кардіо</SectionTitle>
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
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="caps first-letter:uppercase">{fmtDateLong(new Date())}</p>
          <h1 className="truncate text-[2rem] leading-tight font-bold tracking-tight">Привіт, {personName(user.username, profile)}</h1>
        </div>
        {photoUrl(user.id, profile) && (
          <Link href="/profile" aria-label="Профіль" className="mb-1 shrink-0">
            <Avatar name={personName(user.username, profile)} photo={photoUrl(user.id, profile)} size={44} />
          </Link>
        )}
      </header>

      {profile.sick && <SickMode sick={profile.sick} today={today} />}

      {/* Last night against the usual one — and what it means for today's session. */}
      {!profile.sick && ready.lastNight != null && (
        <ReadinessNote
          level={ready.level}
          lastNight={ready.lastNight}
          reasons={ready.reasons}
          advice={ready.advice}
          workout={!active[0] && todays ? { id: todays.id, name: todays.name } : null}
          ai={aiConnected}
          request={updateRequest(ready)}
        />
      )}

      {teamInvites.length > 0 && (
        <Link href="/team" className="flex items-center justify-between gap-3 rounded-[20px] bg-accent/12 p-4 ring-1 ring-accent/40">
          <span className="min-w-0">
            <span className="caps block text-accent">Запрошення в команду</span>
            <span className="block text-[15px] font-semibold">
              {teamInvites[0].by} запрошує вас у «{teamInvites[0].teamName}»
            </span>
          </span>
          <span className="shrink-0 text-sm font-semibold text-accent">Відповісти →</span>
        </Link>
      )}

      {active[0] ? (
        <Link href={`/workouts/${active[0].id}`} className="flex items-center gap-4 rounded-[20px] bg-accent p-5 text-accent-ink">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-black/15">
            <Play size={22} fill="currentColor" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold tracking-wide uppercase opacity-70">Триває · з {fmtTime(active[0].startedAt)}</span>
            <span className="line-clamp-2 text-xl leading-tight font-bold">{active[0].name}</span>
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
    <Suspense fallback={<PageSkeleton variant="home" />}>
      <Content />
    </Suspense>
  );
}
