import { Suspense } from "react";
import Link from "next/link";
import { ActivityCalendar, type DayActivity } from "@/components/activity-calendar";
import { ReportCard, ReviewBacklog } from "@/components/ai";
import { StackedBars, TrendChart } from "@/components/charts";
import { MuscleBalanceView } from "@/components/muscles/muscle-balance";
import { Badge, Card, Disclosure, PageHeader, PageSkeleton, SectionTitle, Segmented, Stat } from "@/components/ui";
import { getAiState, getPeriodReport } from "@/lib/ai";
import { getMuscleBalance, getRecords, getTrainingAnalytics, getWeekSummary } from "@/lib/analytics";
import { BODY_MUSCLES, TARGET_MIN } from "@/lib/muscles";
import { getUser } from "@/lib/auth";
import { normalizeProfile } from "@/lib/profile";
import { getCardioAnalytics } from "@/lib/cardio";
import { CARDIO_COLOR, CARDIO_LABEL, paceLabel } from "@/lib/cardio-kinds";
import { addDays, dayOf, durationParts, fmtDate, fmtDuration, fmtNum, fmtWeight, weekStart } from "@/lib/format";
import { MUSCLE_LABEL } from "@/lib/labels";
import { listWorkouts } from "@/lib/workouts";

export const metadata = { title: "Аналітика" };

const PERIODS = [
  { value: "8", label: "8 тиж" },
  { value: "12", label: "12 тиж" },
  { value: "26", label: "Півроку" },
  { value: "52", label: "Рік" },
];

const KINDS = [
  { value: "all", label: "Усе" },
  { value: "run", label: "Біг" },
  { value: "cycle", label: "Вело" },
];

async function Content({ searchParams }: PageProps<"/analytics">) {
  const sp = await searchParams;
  const weeks = PERIODS.some((p) => p.value === sp.w) ? Number(sp.w) : 12;
  const user = await getUser();
  const userId = user.id;
  const [a, muscles, cardio] = await Promise.all([getTrainingAnalytics(userId, weeks), getMuscleBalance(userId, weeks), getCardioAnalytics(userId, weeks)]);
  const [sessions, records, ai, report] = await Promise.all([
    listWorkouts(userId, { status: "completed", from: a.from, limit: 500 }),
    getRecords(userId, a.from),
    getAiState(userId),
    getPeriodReport(userId, weeks),
  ]);
  const weekLabel = (w: string) => ({ label: fmtDate(w), hint: `${fmtDate(w)} – ${fmtDate(addDays(w, 6))}` });

  // Calendar: which days had what.
  const days: Record<string, DayActivity> = {};
  const mark = (day: string, kind: "gym" | "run" | "cycle" | "other", text: string) => {
    const d = (days[day] ??= { title: "" });
    d[kind] = true;
    d.title = d.title ? `${d.title}; ${text}` : text;
  };
  for (const w of sessions) {
    if (!w.startedAt) continue;
    const min = w.endedAt ? Math.round((w.endedAt.getTime() - w.startedAt.getTime()) / 60000) : null;
    mark(dayOf(w.startedAt), "gym", `${w.name}${min ? `, ${min} хв` : ""}`);
  }
  for (const c of cardio.sessions) {
    const kind = c.kind === "run" || c.kind === "cycle" ? c.kind : "other";
    mark(dayOf(c.startAt), kind, `${CARDIO_LABEL[c.kind]}${c.distanceM ? `, ${fmtNum(c.distanceM / 1000, 1)} км` : `, ${Math.round(c.durationSec / 60)} хв`}`);
  }
  const activeDays = Object.keys(days).length;

  const chrono = [...sessions].reverse();
  const hrPoints = chrono
    .filter((w) => w.avgHr != null)
    .map((w) => ({ label: fmtDate(w.startedAt), value: Math.round(w.avgHr!), hint: `${fmtDate(w.startedAt, { day: "numeric", month: "long" })} · ${w.name}` }));
  const kcalPoints = chrono
    .filter((w) => w.activeKcal != null)
    .map((w) => ({ label: fmtDate(w.startedAt), value: Math.round(w.activeKcal!), hint: `${fmtDate(w.startedAt, { day: "numeric", month: "long" })} · ${w.name}` }));
  // Cardio details: one kind or both, pace (run) or speed (ride) per session, oldest → newest.
  const kind = KINDS.some((k) => k.value === sp.k) ? String(sp.k) : "all";
  const shownKinds: ("run" | "cycle")[] = kind === "all" ? ["run", "cycle"] : [kind as "run" | "cycle"];
  const paceTrend = (k: "run" | "cycle") =>
    cardio.sessions
      .filter((s) => s.kind === k && s.distanceM && s.distanceM > 200)
      .reverse()
      .map((s) => {
        const value = k === "run" ? s.durationSec / 60 / (s.distanceM! / 1000) : s.distanceM! / 1000 / (s.durationSec / 3600);
        return {
          label: fmtDate(s.startAt),
          value: Math.round(value * 100) / 100,
          hint: `${fmtDate(s.startAt, { day: "numeric", month: "long" })} · ${fmtNum(s.distanceM! / 1000, 2)} км`,
          display: paceLabel(k, s.distanceM, s.durationSec) ?? undefined,
        };
      });

  // This week against the previous one.
  const monday = weekStart(dayOf());
  const [wk, weekRecords] = await Promise.all([getWeekSummary(userId), getRecords(userId, monday, 50)]);
  const newRecords = weekRecords.filter((r) => r.isNew).length;
  const lastCardioWeek = cardio.weekly.at(-1);
  const cardioWeek = { km: (lastCardioWeek?.runKm ?? 0) + (lastCardioWeek?.cycleKm ?? 0) + (lastCardioWeek?.walkKm ?? 0), minutes: lastCardioWeek?.minutes ?? 0 };
  const thisWeek = muscles.weeks.at(-1);
  const musclesOk = BODY_MUSCLES.filter((m) => muscles.contributions.filter((c) => c.week === thisWeek && c.muscle === m).reduce((x, c) => x + c.sets, 0) >= TARGET_MIN).length;
  const vs = (cur: number, prev: number, unit = "") => (prev === cur ? "як минулого тижня" : `${cur > prev ? "+" : "−"}${fmtNum(Math.abs(cur - prev))}${unit} до минулого`);
  const cardioKm = cardio.totals.run.distanceM / 1000 + cardio.totals.cycle.distanceM / 1000;
  const cardioCount = cardio.sessions.length;

  return (
    <>
      <PageHeader
        title="Аналітика"
        subtitle="Тиждень одним поглядом, решта — нижче"
      />
      <div className="space-y-7">
        {ai && (
          <section className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
            <ReportCard key={weeks} weeks={weeks} initial={report} />
            <ReviewBacklog />
          </section>
        )}
        {/* The week in one glance; everything deeper is folded below. */}
        <section>
          <SectionTitle action={<span className="text-xs text-muted">проти минулого тижня</span>}>Підсумок тижня</SectionTitle>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Силових" tone="text-strength" value={wk.cur.workouts} hint={vs(wk.cur.workouts, wk.prev.workouts)} />
            <Stat label="Час у залі" tone="text-activity" {...durationParts(wk.cur.durationMin * 60)} hint={vs(wk.cur.durationMin, wk.prev.durationMin, " хв")} />
            <Stat label="Тоннаж" tone="text-strength" value={fmtNum(wk.cur.volume / 1000, 1)} unit="т" hint={vs(Math.round(wk.cur.volume), Math.round(wk.prev.volume), " кг")} />
            <Stat label="Кардіо" tone="text-run" value={fmtNum(cardioWeek.km, 1)} unit="км" hint={`${Math.round(cardioWeek.minutes)} хв`} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="card flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm text-ink-2">Мʼязових груп у нормі</span>
              <span className="num text-lg font-semibold">
                {musclesOk}
                <span className="text-muted">/{BODY_MUSCLES.length}</span>
              </span>
            </div>
            <div className="card flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm text-ink-2">Нових рекордів за тиждень</span>
              <span className={`num text-lg font-semibold ${newRecords ? "text-activity" : ""}`}>{newRecords}</span>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <h2 className="text-[1.35rem] font-bold tracking-tight">Детально</h2>
          <Segmented options={PERIODS} current={String(weeks)} param="w" />
        </div>

        <Disclosure title="Загалом за період" hint={`${a.totals.workouts} тренувань · ${fmtNum(a.totals.volume / 1000, 1)} т · ${fmtNum(cardioKm, 1)} км кардіо`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Силових" tone="text-strength" value={a.totals.workouts} hint={`≈ ${fmtNum(a.totals.workouts / weeks, 1)} на тиждень`} />
            <Stat label="Час у залі" tone="text-activity" {...durationParts(a.totals.durationMin * 60)} />
            <Stat label="Тоннаж" tone="text-strength" value={fmtNum(a.totals.volume / 1000, 1)} unit="т" hint={`${fmtNum(a.totals.sets)} підходів`} />
            <Stat label="Кардіо" tone="text-run" value={fmtNum(cardioKm, 1)} unit="км" hint={`${cardioCount} сесій · ${fmtDuration(cardio.weekly.reduce((s, w) => s + w.minutes, 0) * 60)}`} />
          </div>
        </Disclosure>

        <Disclosure title="Календар і частота" hint={`${activeDays} днів з тренуванням за період`}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Календар активності" action={<span className="text-xs text-muted">{activeDays} днів з тренуванням</span>}>
            <ActivityCalendar from={a.from} weeks={weeks} today={dayOf()} days={days} />
          </Card>
          <Card title="Тренувань на тиждень">
            <TrendChart kind="bar" integer data={a.weekly.map((w) => ({ ...weekLabel(w.week), value: w.workouts }))} />
          </Card>
        </div>
        </Disclosure>

        <Disclosure title="Навантаження по мʼязах" hint="Карта тіла: що недобирає, що перебирає">
          <div>
            <MuscleBalanceView key={weeks} data={muscles} sex={normalizeProfile(user.profile).sex} />
          </div>
        </Disclosure>

        <Disclosure title="Силові тренди" hint="Тоннаж і час у залі за тижнями">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Тоннаж на тиждень, кг">
              <TrendChart kind="bar" unit="кг" data={a.weekly.map((w) => ({ ...weekLabel(w.week), value: Math.round(w.volume) }))} />
            </Card>
            <Card title="Час у залі на тиждень, хв" tone="text-activity">
              <TrendChart kind="bar" unit="хв" color="var(--c-activity)" data={a.weekly.map((w) => ({ ...weekLabel(w.week), value: w.durationMin }))} />
            </Card>
          </div>
        </Disclosure>

        <Disclosure title="Кардіо і пульс" hint="Біг і вело: дистанція, темп, пульс, калорії" defaultOpen={sp.k != null}>
          <div className="mb-4">
            <Segmented options={KINDS} current={kind} param="k" extra={{ w: String(weeks) }} label="Вид кардіо" />
          </div>
          {shownKinds.map((k) => {
            const t = cardio.totals[k];
            return (
              <div key={k} className="mb-4">
                <div className="caps mb-2">{CARDIO_LABEL[k]}</div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Stat label="Дистанція" tone={k === "run" ? "text-run" : "text-cycle"} value={fmtNum(t.distanceM / 1000, 1)} unit="км" />
                  <Stat label="Час" tone="text-activity" {...durationParts(t.durationSec)} />
                  <Stat label={k === "run" ? "Пробіжок" : "Заїздів"} value={t.sessions} hint={`≈ ${fmtNum(t.sessions / weeks, 1)} на тиждень`} />
                  <Stat
                    label={k === "run" ? "Середній темп" : "Середня швидкість"}
                    value={paceLabel(k, t.pacedDistanceM, t.pacedDurationSec)?.split(" ")[0] ?? "—"}
                    unit={k === "run" ? "/км" : "км/год"}
                  />
                </div>
              </div>
            );
          })}
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            {shownKinds.includes("run") && (
              <Card title="Темп пробіжок, хв/км" tone="text-run">
                <TrendChart data={paceTrend("run")} unit="хв/км" digits={2} color="var(--c-run)" />
              </Card>
            )}
            {shownKinds.includes("cycle") && (
              <Card title="Швидкість заїздів, км/год" tone="text-cycle">
                <TrendChart data={paceTrend("cycle")} unit="км/год" digits={1} color="var(--c-cycle)" />
              </Card>
            )}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Кілометри за тижнями">
              <StackedBars
                unit="км"
                series={[
                  { label: CARDIO_LABEL.run, color: CARDIO_COLOR.run },
                  { label: CARDIO_LABEL.cycle, color: CARDIO_COLOR.cycle },
                ]}
                data={cardio.weekly.map((w) => ({ ...weekLabel(w.week), values: [Math.round(w.runKm * 10) / 10, Math.round(w.cycleKm * 10) / 10] }))}
              />
            </Card>
            <Card title="Середній пульс на силових, уд/хв" tone="text-heart">
              <TrendChart data={hrPoints} unit="уд/хв" color="var(--c-heart)" />
            </Card>
            <Card title="Активні калорії за тренування" tone="text-activity">
              <TrendChart kind="bar" data={kcalPoints} unit="ккал" color="var(--c-activity)" />
            </Card>
          </div>
          <Link href="/workouts?t=cardio" className="mt-3 inline-block text-sm text-accent">
            Усі пробіжки й заїзди →
          </Link>
        </Disclosure>

        <Disclosure title="Рекорди" hint={`${records.length} вправ · нових за період: ${records.filter((r) => r.isNew).length}`}>
          <div className="divide-y divide-line">
            {records.length === 0 && <p className="p-6 text-center text-sm text-muted">Рекорди зʼявляться після тренувань із вагою.</p>}
            {records.map((r) => (
              <Link key={r.exerciseId} href={`/exercises/${r.exerciseId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-semibold">{r.name}</span>
                    {r.isNew && <Badge tone="accent">новий</Badge>}
                  </span>
                  <span className="block text-xs text-muted">
                    {fmtWeight(r.weight)} кг × {r.reps} · {fmtDate(r.day, { day: "numeric", month: "short", year: "numeric" })}
                    {r.isNew && r.before != null && r.before < r.e1rm && ` · було ${fmtNum(r.before, 1)} кг`}
                  </span>
                </span>
                <span className="text-right">
                  <span className="num block text-xl font-semibold text-strength">{fmtNum(r.e1rm, 1)}</span>
                  <span className="caps block">1ПМ, кг</span>
                </span>
              </Link>
            ))}
          </div>
        </Disclosure>

        <Disclosure title="Вправи за період" hint={`${a.exercises.length} вправ: тренування, підходи, найкращий результат`}>
          <div>
            {a.exercises.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">Поки немає даних</p>
            ) : (
              <div className="-mx-4 overflow-x-auto px-4">
                <table className="tabular w-full min-w-[32rem] text-sm">
                  <thead>
                    <tr className="caps text-left">
                      <th className="pb-2 font-semibold">Вправа</th>
                      <th className="pb-2 text-right font-semibold">Тренувань</th>
                      <th className="pb-2 text-right font-semibold">Підходів</th>
                      <th className="pb-2 text-right font-semibold">Макс. вага</th>
                      <th className="pb-2 text-right font-semibold">1ПМ (розрах.)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {a.exercises.map((e) => (
                      <tr key={e.exerciseId}>
                        <td className="py-2.5">
                          <Link href={`/exercises/${e.exerciseId}`} className="font-medium hover:underline">
                            {e.name}
                          </Link>
                          <span className="ml-2 text-xs text-muted">{MUSCLE_LABEL[e.muscle]}</span>
                        </td>
                        <td className="py-2.5 text-right">{e.sessions}</td>
                        <td className="py-2.5 text-right">{e.sets}</td>
                        <td className="py-2.5 text-right">{e.maxWeight ? `${fmtNum(e.maxWeight, 2)} кг` : "—"}</td>
                        <td className="py-2.5 text-right">{e.bestE1rm ? `${fmtNum(e.bestE1rm, 1)} кг` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Disclosure>
      </div>
    </>
  );
}

export default function Page(props: PageProps<"/analytics">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content {...props} />
    </Suspense>
  );
}
