import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteCardioButton } from "@/components/cardio/delete-cardio";
import { HrChart } from "@/components/hr-chart";
import { Card, PageHeader, PageSkeleton, Stat } from "@/components/ui";
import { requireUserId } from "@/lib/auth";
import { getCardioSession } from "@/lib/cardio";
import { CARDIO_LABEL, paceLabel } from "@/lib/cardio-kinds";
import { durationParts, fmtDateLong, fmtNum, fmtTime } from "@/lib/format";

export const metadata = { title: "Кардіо" };

async function Content({ params }: PageProps<"/cardio/[id]">) {
  const { id } = await params;
  const userId = await requireUserId();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const s = await getCardioSession(userId, id);
  if (!s) notFound();
  const duration = s.durationSec ?? Math.round((s.endAt.getTime() - s.startAt.getTime()) / 1000);
  const pace = paceLabel(s.kind, s.distanceM, duration);
  const tone = s.kind === "run" ? "text-run" : s.kind === "cycle" ? "text-cycle" : "text-activity";

  return (
    <>
      <PageHeader
        title={CARDIO_LABEL[s.kind]}
        subtitle={
          <>
            <Link href="/cardio" className="text-accent">
              ← Кардіо
            </Link>{" "}
            · {fmtDateLong(s.startAt)}, {fmtTime(s.startAt)}–{fmtTime(s.endAt)}
            {s.manual ? " · додано вручну" : ` · ${s.activityType}`}
          </>
        }
        actions={s.manual ? <DeleteCardioButton id={s.id} /> : undefined}
      />
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="Дистанція" tone={tone} value={s.distanceM ? fmtNum(s.distanceM / 1000, 2) : "—"} unit="км" />
          <Stat label="Час" tone="text-activity" {...durationParts(duration)} />
          <Stat label={s.kind === "cycle" ? "Швидкість" : "Темп"} value={pace?.split(" ")[0] ?? "—"} unit={s.kind === "cycle" ? "км/год" : "/км"} />
          <Stat label="Середній пульс" tone="text-heart" value={fmtNum(s.avgHr)} unit="уд/хв" />
          <Stat label="Макс. пульс" tone="text-heart" value={fmtNum(s.maxHr)} unit="уд/хв" />
          <Stat label="Активні калорії" tone="text-activity" value={fmtNum(s.activeKcal)} unit="ккал" />
        </div>
        {s.hrSamples && s.hrSamples.length > 1 && (
          <Card title="Пульс, уд/хв" tone="text-heart">
            <HrChart samples={s.hrSamples} start={s.startAt.toISOString()} end={s.endAt.toISOString()} />
          </Card>
        )}
        {s.workoutId && (
          <Link href={`/workouts/${s.workoutId}`} className="card block p-4 text-[15px] hover:bg-surface-2">
            Це частина тренування в залі <span className="text-accent">— відкрити →</span>
          </Link>
        )}
      </div>
    </>
  );
}

export default function Page(props: PageProps<"/cardio/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content {...props} />
    </Suspense>
  );
}
