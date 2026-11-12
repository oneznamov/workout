import { Suspense } from "react";
import Link from "next/link";
import { ActivityCalendar, type DayActivity } from "@/components/activity-calendar";
import { StackedBars, TrendChart } from "@/components/charts";
import { MuscleBalanceView } from "@/components/muscles/muscle-balance";
import { Badge, Card, PageHeader, PageSkeleton, SectionTitle, Segmented, Stat } from "@/components/ui";
import { getMuscleBalance, getRecords, getTrainingAnalytics } from "@/lib/analytics";
import { requireUserId } from "@/lib/auth";
import { getCardioAnalytics } from "@/lib/cardio";
import { CARDIO_COLOR, CARDIO_LABEL } from "@/lib/cardio-kinds";
import { addDays, dayOf, fmtDate, fmtDuration, fmtNum, fmtWeight } from "@/lib/format";
import { MUSCLE_LABEL } from "@/lib/labels";
import { listWorkouts } from "@/lib/workouts";

export const metadata = { title: "Аналітика" };

const PERIODS = [
  { value: "8", label: "8 тиж" },
  { value: "12", label: "12 тиж" },
  { value: "26", label: "Півроку" },
  { value: "52", label: "Рік" },
];

async function Content({ searchParams }: PageProps<"/analytics">) {
  const sp = await searchParams;
  const weeks = PERIODS.some((p) => p.value === sp.w) ? Number(sp.w) : 12;
  const userId = await requireUserId();
  const [a, muscles, cardio] = await Promise.all([getTrainingAnalytics(userId, weeks), getMuscleBalance(userId, weeks), getCardioAnalytics(userId, weeks)]);
  const [sessions, records] = await Promise.all([
    listWorkouts(userId, { status: "completed", from: a.from, limit: 500 }),
    getRecords(userId, a.from),
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
  const cardioKm = cardio.totals.run.distanceM / 1000 + cardio.totals.cycle.distanceM / 1000;
  const cardioCount = cardio.sessions.length;

  return (
    <>
      <PageHeader
        title="Аналітика"
        subtitle={`${fmtDate(a.from, { day: "numeric", month: "short", year: "numeric" })} – сьогодні`}
        actions={<Segmented options={PERIODS} current={String(weeks)} param="w" />}
      />
      <div className="space-y-7">
        <section>
          <SectionTitle>Зведення</SectionTitle>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Силових" tone="text-strength" value={a.totals.workouts} hint={`≈ ${fmtNum(a.totals.workouts / weeks, 1)} на тиждень`} />
            <Stat label="Час у залі" tone="text-activity" value={fmtDuration(a.totals.durationMin * 60)} />
            <Stat label="Тоннаж" tone="text-strength" value={fmtNum(a.totals.volume / 1000, 1)} unit="т" hint={`${fmtNum(a.totals.sets)} підходів`} />
            <Stat label="Кардіо" tone="text-run" value={fmtNum(cardioKm, 1)} unit="км" hint={`${cardioCount} сесій · ${fmtDuration(cardio.weekly.reduce((s, w) => s + w.minutes, 0) * 60)}`} />
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Календар активності" action={<span className="text-xs text-muted">{activeDays} днів з тренуванням</span>}>
            <ActivityCalendar from={a.from} weeks={weeks} today={dayOf()} days={days} />
          </Card>
          <Card title="Тренувань на тиждень">
            <TrendChart kind="bar" integer data={a.weekly.map((w) => ({ ...weekLabel(w.week), value: w.workouts }))} />
          </Card>
        </div>

        <section>
          <SectionTitle>Навантаження по мʼязах</SectionTitle>
          <div className="card p-4">
            <MuscleBalanceView key={weeks} data={muscles} />
          </div>
        </section>

        <section>
          <SectionTitle>Силові</SectionTitle>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Тоннаж на тиждень, кг">
              <TrendChart kind="bar" unit="кг" data={a.weekly.map((w) => ({ ...weekLabel(w.week), value: Math.round(w.volume) }))} />
            </Card>
            <Card title="Час у залі на тиждень, хв" tone="text-activity">
              <TrendChart kind="bar" unit="хв" color="var(--c-activity)" data={a.weekly.map((w) => ({ ...weekLabel(w.week), value: w.durationMin }))} />
            </Card>
          </div>
        </section>

        <section>
          <SectionTitle action={<Link href="/cardio" className="text-sm text-accent">Кардіо →</Link>}>Кардіо і пульс</SectionTitle>
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
        </section>

        <section>
          <SectionTitle>Рекорди</SectionTitle>
          <div className="card divide-y divide-line">
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
        </section>

        <section>
          <SectionTitle>Вправи за період</SectionTitle>
          <div className="card p-4">
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
        </section>
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
