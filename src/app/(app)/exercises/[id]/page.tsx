import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveExerciseButton } from "@/components/archive-exercise";
import { TrendChart } from "@/components/charts";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { getExerciseHistory } from "@/lib/analytics";
import { requireUserId } from "@/lib/auth";
import { fmtDate, fmtNum } from "@/lib/format";
import { EQUIPMENT_LABEL, MUSCLE_LABEL, TRACKING_LABEL } from "@/lib/labels";
import { describeSet } from "@/lib/shape";
import { getExercise } from "@/lib/workouts";

export const metadata = { title: "Вправа" };

async function Content({ params }: PageProps<"/exercises/[id]">) {
  const { id } = await params;
  const userId = await requireUserId();
  const ex = await getExercise(userId, id).catch(() => notFound());
  const history = await getExerciseHistory(userId, id);

  const weighted = ex.tracking === "weight_reps" || (ex.tracking === "reps" && history.some((h) => h.topWeight > 0));
  const metric = (h: (typeof history)[number]) =>
    ex.tracking === "duration"
      ? Math.max(...h.sets.map((s) => s.durationSec ?? 0))
      : ex.tracking === "distance"
        ? h.sets.reduce((a, s) => a + (s.distanceM ?? 0), 0) / 1000
        : weighted
          ? h.bestE1rm
          : Math.max(...h.sets.map((s) => s.reps ?? 0));
  const metricLabel =
    ex.tracking === "duration" ? "Найдовший підхід, сек" : ex.tracking === "distance" ? "Дистанція за тренування, км" : weighted ? "Розрахунковий 1ПМ, кг" : "Найбільше повторень у підході";
  const unit = ex.tracking === "duration" ? "сек" : ex.tracking === "distance" ? "км" : weighted ? "кг" : "повт";
  const digits = ex.tracking === "distance" || weighted ? 1 : 0;

  const best = history.length ? Math.max(...history.map(metric)) : null;
  const maxWeight = history.length ? Math.max(...history.map((h) => h.topWeight)) : null;
  const maxVolume = history.length ? Math.max(...history.map((h) => h.volume)) : null;

  return (
    <>
      <PageHeader
        title={ex.name}
        subtitle={
          <>
            <Link href="/exercises" className="hover:text-ink">
              ← Вправи
            </Link>
            {ex.nameUk ? ` · ${ex.nameUk}` : ""}
          </>
        }
        actions={ex.userId ? <ArchiveExerciseButton id={ex.id} /> : undefined}
      />
      <div className="mb-5 flex flex-wrap gap-1.5">
        <Badge tone="accent">{MUSCLE_LABEL[ex.muscle]}</Badge>
        {ex.secondaryMuscles.map((m) => (
          <Badge key={m}>{MUSCLE_LABEL[m]}</Badge>
        ))}
        <Badge>{EQUIPMENT_LABEL[ex.equipment]}</Badge>
        <Badge>{TRACKING_LABEL[ex.tracking]}</Badge>
      </div>

      {history.length === 0 ? (
        <Empty>Цю вправу ще не виконували. Після першого тренування тут зʼявляться рекорди й графік прогресу.</Empty>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Тренувань" value={history.length} hint={`останнє ${fmtDate(history.at(-1)!.date)}`} />
            <Stat label={weighted ? "Рекорд 1ПМ (розрах.)" : "Рекорд"} value={fmtNum(best, digits)} unit={unit} />
            {weighted && <Stat label="Макс. вага" value={fmtNum(maxWeight, 2)} unit="кг" />}
            {weighted && <Stat label="Макс. тоннаж за тренування" value={fmtNum(maxVolume)} unit="кг" />}
          </div>

          <Card title={metricLabel}>
            <TrendChart
              data={history.map((h) => ({ label: fmtDate(h.date), value: Math.round(metric(h) * 10) / 10, hint: `${fmtDate(h.date, { day: "numeric", month: "long", year: "numeric" })}` }))}
              unit={unit}
              digits={digits}
            />
          </Card>

          <Card title="Історія">
            <ul className="divide-y divide-line">
              {[...history].reverse().map((h) => (
                <li key={h.workoutId} className="py-2.5">
                  <Link href={`/workouts/${h.workoutId}`} className="flex items-baseline justify-between gap-3 hover:underline">
                    <span className="truncate text-sm">{h.workoutName}</span>
                    <span className="shrink-0 text-xs text-muted">{fmtDate(h.date, { day: "numeric", month: "short", year: "numeric" })}</span>
                  </Link>
                  <p className="tabular mt-0.5 text-sm text-ink-2">{h.sets.map((s) => describeSet(ex.tracking, s)).join(" · ")}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}

export default function Page(props: PageProps<"/exercises/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content {...props} />
    </Suspense>
  );
}
