import { Suspense } from "react";
import { CardioForm } from "@/components/cardio/cardio-form";
import { CardioRow } from "@/components/cardio/cardio-row";
import { StackedBars, TrendChart } from "@/components/charts";
import { Card, Empty, PageHeader, PageSkeleton, SectionTitle, Segmented, Stat } from "@/components/ui";
import { requireUserId } from "@/lib/auth";
import { getCardioAnalytics } from "@/lib/cardio";
import { CARDIO_COLOR, CARDIO_LABEL, paceLabel, type CardioKind } from "@/lib/cardio-kinds";
import { addDays, dayOf, fmtDate, fmtDuration, fmtNum } from "@/lib/format";

export const metadata = { title: "Кардіо" };

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

async function Content({ searchParams }: PageProps<"/cardio">) {
  const sp = await searchParams;
  const weeks = PERIODS.some((p) => p.value === sp.w) ? Number(sp.w) : 12;
  const kind = KINDS.some((k) => k.value === sp.k) ? String(sp.k) : "all";
  const userId = await requireUserId();
  const a = await getCardioAnalytics(userId, weeks);
  const sessions = a.sessions.filter((s) => kind === "all" || s.kind === kind);
  const shown: CardioKind[] = kind === "all" ? ["run", "cycle"] : [kind as CardioKind];
  const weekLabel = (w: string) => ({ label: fmtDate(w), hint: `${fmtDate(w)} – ${fmtDate(addDays(w, 6))}` });
  const km = (w: (typeof a.weekly)[number], k: CardioKind) => (k === "run" ? w.runKm : k === "cycle" ? w.cycleKm : w.walkKm);

  // Pace (run) or speed (ride) per session, oldest → newest.
  const trend = (k: "run" | "cycle") =>
    a.sessions
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

  return (
    <>
      <PageHeader
        title="Кардіо"
        subtitle="Біг і вело — з Apple Watch або вручну"
        actions={<Segmented options={PERIODS} current={String(weeks)} param="w" extra={{ k: kind }} />}
      />
      <div className="space-y-6">
        <Segmented options={KINDS} current={kind} param="k" extra={{ w: String(weeks) }} label="Вид" />

        {shown.map((k) => {
          const t = a.totals[k];
          return (
            <section key={k}>
              <SectionTitle>{CARDIO_LABEL[k]}</SectionTitle>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Дистанція" tone={k === "run" ? "text-run" : "text-cycle"} value={fmtNum(t.distanceM / 1000, 1)} unit="км" />
                <Stat label="Час" tone="text-activity" value={fmtDuration(t.durationSec)} />
                <Stat label={k === "run" ? "Пробіжок" : "Заїздів"} value={t.sessions} hint={`≈ ${fmtNum(t.sessions / weeks, 1)} на тиждень`} />
                <Stat
                  label={k === "run" ? "Середній темп" : "Середня швидкість"}
                  value={paceLabel(k, t.pacedDistanceM, t.pacedDurationSec)?.split(" ")[0] ?? "—"}
                  unit={k === "run" ? "/км" : "км/год"}
                />
              </div>
            </section>
          );
        })}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Кілометри за тижнями">
            <StackedBars
              unit="км"
              series={shown.map((k) => ({ label: CARDIO_LABEL[k], color: CARDIO_COLOR[k] }))}
              data={a.weekly.map((w) => ({ ...weekLabel(w.week), values: shown.map((k) => Math.round(km(w, k) * 10) / 10) }))}
            />
          </Card>
          {shown.includes("run") && (
            <Card title="Темп пробіжок, хв/км" tone="text-run">
              <TrendChart data={trend("run")} unit="хв/км" digits={2} color="var(--c-run)" />
            </Card>
          )}
          {shown.includes("cycle") && (
            <Card title="Швидкість заїздів, км/год" tone="text-cycle">
              <TrendChart data={trend("cycle")} unit="км/год" digits={1} color="var(--c-cycle)" />
            </Card>
          )}
        </div>

        <section>
          <SectionTitle>Історія</SectionTitle>
          <div className="mb-3">
            <CardioForm today={dayOf()} />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {sessions.length ? (
              sessions.map((s) => <CardioRow key={s.id} s={s} />)
            ) : (
              <Empty>
                За цей період ще немає пробіжок чи заїздів. Запишіть «Біг» або «Велосипед» на Apple Watch — після синхронізації
                вони зʼявляться тут — або додайте вручну.
              </Empty>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

export default function Page(props: PageProps<"/cardio">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content {...props} />
    </Suspense>
  );
}
