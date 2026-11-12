"use client";

import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { cx, fmtClock, fmtDuration } from "@/lib/format";
import type { CWorkout } from "@/lib/shape";
import { buildTimeline } from "@/lib/timeline";
import { HrChart } from "../hr-chart";

const ZONE_OPACITY = [0.22, 0.4, 0.58, 0.78, 1];

/**
 * "What happened when": sets laid over the heart-rate curve, rest between sets,
 * work vs rest and time in heart-rate zones.
 */
export function WorkoutTimeline({ workout, onApply }: { workout: CWorkout; onApply?: (times: Record<string, string>) => void }) {
  const tl = useMemo(() => buildTimeline(workout), [workout]);
  if (!tl || !workout.startedAt || !workout.endedAt) return null;
  const samples = workout.health.flatMap((h) => h.hrSamples ?? []);
  const zoneTotal = tl.zones?.reduce((a, z) => a + z.sec, 0) ?? 0;
  const modeText =
    tl.mode === "logged"
      ? "За відмітками підходів"
      : tl.confidence === "medium"
        ? "Оцінка за пульсом"
        : "Груба оцінка за пульсом";

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <Sparkles size={16} className="text-accent" /> Таймлайн тренування
        </h2>
        <span className={cx("rounded-full px-2.5 py-0.5 text-xs font-medium", tl.mode === "logged" ? "bg-good/15 text-good" : "bg-warning/15 text-warning")}>
          {modeText}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <Figure label="Робота" value={fmtDuration(tl.workSec)} />
        <Figure label="Відпочинок" value={fmtDuration(tl.restSec)} />
        <Figure label="Між підходами" value={tl.avgRestSec != null ? fmtClock(tl.avgRestSec) : "—"} tone="text-accent" />
      </div>

      {samples.length > 1 && (
        <div className="mt-4">
          <div className="caps mb-1">Пульс і підходи (сірі смуги)</div>
          <HrChart
            samples={samples}
            start={workout.startedAt}
            end={workout.endedAt}
            bands={tl.sets.map((s) => ({ start: s.start, end: s.end, label: `${s.exercise} · підхід ${s.index} · ${s.label}` }))}
          />
        </div>
      )}

      {tl.zones && zoneTotal > 0 && (
        <div className="mt-4">
          <div className="caps mb-1.5">Час у зонах пульсу · від макс. {tl.hrRef} уд/хв</div>
          <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
            {tl.zones.map((z, i) =>
              z.sec > 0 ? <span key={z.zone} style={{ width: `${(z.sec / zoneTotal) * 100}%`, background: "var(--c-heart)", opacity: ZONE_OPACITY[i] }} /> : null,
            )}
          </div>
          <ul className="mt-2 grid grid-cols-5 gap-1 text-center text-[11px] text-muted">
            {tl.zones.map((z, i) => (
              <li key={z.zone}>
                <span className="mx-auto mb-0.5 block size-2 rounded-full" style={{ background: "var(--c-heart)", opacity: ZONE_OPACITY[i] }} />
                <span className="block">{z.label}</span>
                <span className="num block text-[13px] font-semibold text-ink">{Math.round(z.sec / 60)} хв</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {tl.byExercise.map((e) => (
          <div key={e.weId}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[15px] font-semibold">{e.exercise}</span>
              <span className="shrink-0 text-xs text-muted">
                відпочинок між підходами{" "}
                <span className="num text-sm font-semibold text-ink">{e.avgRestSec != null ? fmtClock(e.avgRestSec) : "—"}</span>
              </span>
            </div>
            <ol className="mt-1.5 flex flex-wrap gap-1.5">
              {tl.sets
                .filter((s) => s.weId === e.weId)
                .map((s) => (
                  <li key={s.setId} className="rounded-xl bg-surface-2 px-2.5 py-1.5 text-xs">
                    <span className="num text-[13px] font-semibold text-ink">{s.label}</span>
                    {s.restBeforeSec != null && <span className="ml-1.5 text-muted">після {fmtClock(s.restBeforeSec)}</span>}
                    {s.peakHr != null && <span className="ml-1.5 text-heart">♥ {s.peakHr}</span>}
                  </li>
                ))}
            </ol>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-muted">
        {tl.mode === "logged"
          ? "Час підходів узято з моменту, коли ви їх відмічали; відпочинок — проміжок між кінцем одного підходу й початком наступного (тривалість підходу оцінено за кількістю повторень)."
          : "Це тренування внесли заднім числом, тож час підходів оцінено: підходи рівномірно розкладено по тренуванню й підтягнуто до найближчих піків пульсу. Що частіше годинник записує пульс, то точніше — у Health Auto Export поставте для тренувань Time Grouping: Seconds."}
      </p>
      {tl.mode === "estimated" && onApply && (
        <button
          onClick={() =>
            window.confirm("Записати оцінений час у підходи цього тренування? Далі таймлайн рахуватиметься від цих значень.") &&
            onApply(Object.fromEntries(tl.sets.map((s) => [s.setId, s.end])))
          }
          className="btn btn-sm btn-ghost mt-3"
        >
          Записати цей час у тренування
        </button>
      )}
    </section>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="caps">{label}</div>
      <div className={cx("num text-xl font-semibold", tone)}>{value}</div>
    </div>
  );
}
