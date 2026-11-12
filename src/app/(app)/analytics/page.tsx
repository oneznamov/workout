import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui";
import Link from "next/link";
import { RankBars, TrendChart } from "@/components/charts";
import { Card, PageHeader, Segmented, Stat } from "@/components/ui";
import { getTrainingAnalytics } from "@/lib/analytics";
import { requireUserId } from "@/lib/auth";
import { addDays, fmtDate, fmtDuration, fmtNum } from "@/lib/format";
import { MUSCLE_LABEL } from "@/lib/labels";

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
  const a = await getTrainingAnalytics(userId, weeks);
  const weekLabel = (w: string) => ({ label: fmtDate(w), hint: `${fmtDate(w)} – ${fmtDate(addDays(w, 6))}` });

  return (
    <>
      <PageHeader
        title="Аналітика"
        subtitle={`${fmtDate(a.from, { day: "numeric", month: "short", year: "numeric" })} – сьогодні`}
        actions={<Segmented options={PERIODS} current={String(weeks)} param="w" />}
      />
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Тренувань" value={a.totals.workouts} hint={`≈ ${fmtNum(a.totals.workouts / weeks, 1)} на тиждень`} />
          <Stat label="Час у залі" value={fmtDuration(a.totals.durationMin * 60)} />
          <Stat label="Підходів" value={fmtNum(a.totals.sets)} />
          <Stat label="Тоннаж" value={fmtNum(a.totals.volume / 1000, 1)} unit="т" />
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Тренувань на тиждень">
            <TrendChart kind="bar" integer data={a.weekly.map((w) => ({ ...weekLabel(w.week), value: w.workouts }))} />
          </Card>
          <Card title="Тоннаж на тиждень, кг">
            <TrendChart kind="bar" unit="кг" data={a.weekly.map((w) => ({ ...weekLabel(w.week), value: Math.round(w.volume) }))} />
          </Card>
          <Card title="Час у залі на тиждень, хв">
            <TrendChart kind="bar" unit="хв" data={a.weekly.map((w) => ({ ...weekLabel(w.week), value: w.durationMin }))} />
          </Card>
          <Card title="Робочі підходи за групами мʼязів">
            <RankBars items={a.muscles.map((m) => ({ label: MUSCLE_LABEL[m.muscle], value: m.sets }))} />
          </Card>
        </div>

        <Card title="Вправи за період">
          {a.exercises.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Поки немає даних</p>
          ) : (
            <div className="-mx-4 overflow-x-auto px-4">
              <table className="tabular w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="pb-2 font-normal">Вправа</th>
                    <th className="pb-2 text-right font-normal">Тренувань</th>
                    <th className="pb-2 text-right font-normal">Підходів</th>
                    <th className="pb-2 text-right font-normal">Макс. вага</th>
                    <th className="pb-2 text-right font-normal">1ПМ (розрах.)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {a.exercises.map((e) => (
                    <tr key={e.exerciseId}>
                      <td className="py-2">
                        <Link href={`/exercises/${e.exerciseId}`} className="hover:underline">
                          {e.name}
                        </Link>
                        <span className="ml-2 text-xs text-muted">{MUSCLE_LABEL[e.muscle]}</span>
                      </td>
                      <td className="py-2 text-right">{e.sessions}</td>
                      <td className="py-2 text-right">{e.sets}</td>
                      <td className="py-2 text-right">{e.maxWeight ? `${fmtNum(e.maxWeight, 2)} кг` : "—"}</td>
                      <td className="py-2 text-right">{e.bestE1rm ? `${fmtNum(e.bestE1rm, 1)} кг` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
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
