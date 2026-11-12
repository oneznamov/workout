"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, HeartPulse } from "lucide-react";
import type { MuscleGroup } from "@/db/schema";
import { addDays, cx, fmtDate, fmtNum } from "@/lib/format";
import { MUSCLE_LABEL } from "@/lib/labels";
import {
  BODY_MUSCLES,
  LOAD_STOPS,
  loadColor,
  muscleStatus,
  STATUS_INFO,
  TARGET_MAX,
  TARGET_MIN,
  type MuscleBalance,
} from "@/lib/muscles";
import type { Sex } from "@/lib/profile";
import { BodyMap } from "./body-map";

const BAR_MAX = 25;

function daysBetween(a: string, b: string) {
  return Math.round((+new Date(`${b}T12:00:00Z`) - +new Date(`${a}T12:00:00Z`)) / 86400000);
}

function agoLabel(last: string | undefined, today: string) {
  if (!last) return "ще не тренували";
  const d = daysBetween(last, today);
  if (d <= 0) return "сьогодні";
  if (d === 1) return "вчора";
  return `${d} дн. тому`;
}

/** Load per muscle for one week, or the weekly average across all loaded weeks. */
function useValues(data: MuscleBalance, mode: "week" | "avg", week: string) {
  return useMemo(() => {
    const totals = Object.fromEntries(BODY_MUSCLES.map((m) => [m, 0])) as Record<MuscleGroup, number>;
    const bySource = new Map<string, { muscle: MuscleGroup; exerciseId: string; name: string; sets: number; cardio: boolean }>();
    const div = mode === "avg" ? data.weeks.length : 1;
    for (const c of data.contributions) {
      if (mode === "week" && c.week !== week) continue;
      totals[c.muscle] += c.sets / div;
      const key = `${c.muscle}|${c.exerciseId}`;
      const e = bySource.get(key) ?? { muscle: c.muscle, exerciseId: c.exerciseId, name: c.name, sets: 0, cardio: c.cardio ?? false };
      e.sets += c.sets / div;
      bySource.set(key, e);
    }
    let cardioMinutes = 0;
    let cardioLoad = 0;
    for (const c of data.cardio) {
      if (mode === "week" && c.week !== week) continue;
      cardioMinutes += c.minutes / div;
      cardioLoad += c.load / div;
    }
    return { totals, bySource: [...bySource.values()], cardioMinutes, cardioLoad };
  }, [data, mode, week]);
}

function needsWork(data: MuscleBalance, totals: Record<MuscleGroup, number>) {
  return BODY_MUSCLES.filter((m) => STATUS_INFO[muscleStatus(totals[m])].needsWork).sort(
    (a, b) => totals[a] - totals[b] || (data.lastTrained[a] ?? "").localeCompare(data.lastTrained[b] ?? ""),
  );
}

function Legend() {
  const max = LOAD_STOPS[LOAD_STOPS.length - 1][0];
  const gradient = LOAD_STOPS.map(([v, c]) => `${c} ${(v / max) * 100}%`).join(", ");
  return (
    <div aria-label="Шкала навантаження на тиждень: від нуля до тридцяти і більше балів">
      <div className="h-2.5 rounded-full" style={{ background: `linear-gradient(to right, ${gradient})` }} />
      <div className="tabular relative mt-1 h-4 text-[11px] text-muted">
        {[0, 5, 10, 20, 30].map((v) => (
          <span key={v} className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: `${(v / max) * 100}%` }}>
            {v === 30 ? "30+" : v}
          </span>
        ))}
      </div>
      <div className="mt-0.5 flex justify-between text-[11px] text-muted">
        <span>ледь зачепило</span>
        <span>норма 10–20</span>
        <span>забагато</span>
      </div>
    </div>
  );
}

/** Heart & lungs: weekly cardio on the same heat scale (150 intensity-minutes ≈ the lime "norm"). */
function CardioTile({ minutes, load, perWeek }: { minutes: number; load: number; perWeek: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full" style={{ background: loadColor(load), color: load > 0 ? "#000" : "var(--muted)" }}>
        <HeartPulse size={20} />
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold">Серце й легені</div>
        <div className="text-xs text-muted">
          <span className="num text-sm font-semibold text-ink">{fmtNum(minutes)}</span> хв кардіо{perWeek ? " на тиждень" : ""} · орієнтир 150
        </div>
      </div>
    </div>
  );
}

/** Compact dashboard card: this week's map plus what still needs work. */
export function MuscleWeekCard({ data, sex = null }: { data: MuscleBalance; sex?: Sex | null }) {
  const week = data.weeks.at(-1)!;
  const { totals, cardioMinutes, cardioLoad } = useValues(data, "week", week);
  const todo = needsWork(data, totals);
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,13rem)_1fr]">
      <BodyMap values={totals} sex={sex} />
      <div className="space-y-3">
        <div>
          <div className="caps">Ще варто пропрацювати</div>
          {todo.length ? (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {todo.map((m) => (
                <li key={m} className="flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs">
                  <span className="size-2 rounded-full" style={{ background: loadColor(totals[m]) }} />
                  {MUSCLE_LABEL[m]}
                  <span className="num text-muted">{fmtNum(totals[m], 1)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm">Усі групи набрали щонайменше {TARGET_MIN} балів.</p>
          )}
        </div>
        <CardioTile minutes={cardioMinutes} load={cardioLoad} perWeek={false} />
        <Legend />
        <Link href="/analytics" className="inline-block text-xs text-accent">
          Аналітика по мʼязах →
        </Link>
      </div>
    </div>
  );
}

export function MuscleBalanceView({ data, sex = null }: { data: MuscleBalance; sex?: Sex | null }) {
  const [mode, setMode] = useState<"week" | "avg">("week");
  const [index, setIndex] = useState(data.weeks.length - 1);
  const [selected, setSelected] = useState<MuscleGroup | null>(null);
  const safeIndex = Math.min(index, data.weeks.length - 1);
  const week = data.weeks[safeIndex];
  const isCurrent = safeIndex === data.weeks.length - 1;
  const { totals, bySource, cardioMinutes, cardioLoad } = useValues(data, mode, week);
  const todo = needsWork(data, totals);
  const unit = mode === "avg" ? "балів/тиж" : "балів";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-full bg-surface-2 p-1" role="group" aria-label="Режим">
          {(
            [
              ["week", "По тижнях"],
              ["avg", "Загалом"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cx("rounded-full px-3.5 py-1.5 text-[13px] font-medium", mode === m ? "bg-surface-3 text-ink" : "text-muted hover:text-ink")}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "week" ? (
          <div className="flex items-center gap-1">
            <button onClick={() => setIndex(Math.max(0, safeIndex - 1))} disabled={safeIndex === 0} aria-label="Попередній тиждень" className="icon-btn size-9 bg-surface-2">
              <ChevronLeft size={16} />
            </button>
            <span className="tabular min-w-36 text-center text-sm" aria-live="polite">
              {fmtDate(week)} – {fmtDate(addDays(week, 6))}
              {isCurrent && <span className="block text-[11px] text-muted">цей тиждень, ще триває</span>}
            </span>
            <button
              onClick={() => setIndex(Math.min(data.weeks.length - 1, safeIndex + 1))}
              disabled={isCurrent}
              aria-label="Наступний тиждень"
              className="icon-btn size-9 bg-surface-2"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        ) : (
          <span className="text-sm text-ink-2">У середньому на тиждень · останні {data.weeks.length} тиж.</span>
        )}
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(0,17rem)_1fr]">
        <div className="space-y-3">
          <BodyMap values={totals} sex={sex} selected={selected} onSelect={(m) => setSelected(selected === m ? null : m)} />
          <CardioTile minutes={cardioMinutes} load={cardioLoad} perWeek={mode === "avg"} />
          <Legend />
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl bg-surface-2 p-3.5">
            <div className="caps">
              {mode === "week" ? "Варто пропрацювати цього тижня" : "Відстають у середньому"} · орієнтир {TARGET_MIN}–{TARGET_MAX} балів
            </div>
            <p className="mt-1 text-[15px]">
              {todo.length ? todo.map((m) => `${MUSCLE_LABEL[m]} (${fmtNum(totals[m], 1)})`).join(", ") : "Усі групи в нормі або вище."}
            </p>
          </div>

          <ul>
            {BODY_MUSCLES.map((m) => {
              const v = totals[m];
              const info = STATUS_INFO[muscleStatus(v)];
              return (
                <li key={m}>
                  <button
                    onClick={() => setSelected(selected === m ? null : m)}
                    aria-pressed={selected === m}
                    className={cx(
                      "grid w-full grid-cols-[6.5rem_1fr_auto] items-center gap-3 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-surface-2",
                      selected === m && "bg-surface-2",
                    )}
                  >
                    <span className="truncate">{MUSCLE_LABEL[m]}</span>
                    <span className="relative h-2.5">
                      <span
                        className="absolute inset-y-0 rounded-full bg-white/[0.09]"
                        style={{ left: `${(TARGET_MIN / BAR_MAX) * 100}%`, width: `${((TARGET_MAX - TARGET_MIN) / BAR_MAX) * 100}%` }}
                      />
                      <span className="absolute inset-y-0 left-0 w-px bg-axis" />
                      {v > 0 && (
                        <span
                          className="absolute inset-y-0 left-0 rounded-full"
                          style={{ width: `${Math.max(2.5, Math.min(100, (v / BAR_MAX) * 100))}%`, background: loadColor(v) }}
                        />
                      )}
                    </span>
                    <span className="w-28 text-right">
                      <span className="num font-semibold">{fmtNum(v, 1)}</span> <span className="text-xs text-muted">· {info.label.toLowerCase()}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted">
            1 бал ≈ один важкий робочий підхід для основної групи мʼязів вправи (0,5 — для допоміжних). Легші підходи рахуються
            частково — порівняно з вашим найкращим результатом у цій вправі, розминкові не рахуються. Кардіо додає мʼязам, які
            воно навантажує, приблизно 1 бал за 10 хвилин з поправкою на пульс. Смуга на шкалі — орієнтир {TARGET_MIN}–{TARGET_MAX} балів на тиждень.
          </p>
        </div>
      </div>

      {selected ? (
        <MuscleDetail
          muscle={selected}
          value={totals[selected]}
          unit={unit}
          lastTrained={agoLabel(data.lastTrained[selected], data.today)}
          worked={bySource.filter((e) => e.muscle === selected).sort((a, b) => b.sets - a.sets)}
          suggestions={data.suggestions[selected] ?? []}
        />
      ) : (
        <p className="text-center text-xs text-muted">Натисніть на мʼяз на фігурі або в списку, щоб побачити, що його навантажувало.</p>
      )}
    </div>
  );
}

function MuscleDetail({
  muscle,
  value,
  unit,
  lastTrained,
  worked,
  suggestions,
}: {
  muscle: MuscleGroup;
  value: number;
  unit: string;
  lastTrained: string;
  worked: { exerciseId: string; name: string; sets: number; cardio: boolean }[];
  suggestions: MuscleBalance["suggestions"][MuscleGroup];
}) {
  const info = STATUS_INFO[muscleStatus(value)];
  const missing = Math.max(0, TARGET_MIN - value);
  const ref = useRef<HTMLDivElement>(null);
  // On a phone the panel sits below the list — bring it into view when a muscle is picked.
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [muscle]);
  return (
    <div ref={ref} className="scroll-mb-24 rounded-2xl bg-surface-2 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[17px] font-semibold">
          <span className="size-3 rounded-full" style={{ background: loadColor(value) }} />
          {MUSCLE_LABEL[muscle]}
        </h3>
        <span className="text-sm text-ink-2">
          <span className="num font-semibold text-ink">{fmtNum(value, 1)}</span> {unit} · {info.label.toLowerCase()} · востаннє: {lastTrained}
        </span>
      </div>
      {info.needsWork && (
        <p className="mt-2 text-sm text-ink-2">
          До нижньої межі норми бракує приблизно <span className="num font-semibold text-ink">{fmtNum(Math.ceil(missing))}</span> балів — це стільки ж
          важких підходів.
        </p>
      )}
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="caps mb-1">Що навантажувало</div>
          {worked.length ? (
            <ul className="space-y-1 text-sm">
              {worked.map((e) => (
                <li key={e.exerciseId} className="flex justify-between gap-3">
                  {e.cardio ? (
                    <Link href="/cardio" className="truncate hover:underline">
                      {e.name} <span className="text-xs text-muted">кардіо</span>
                    </Link>
                  ) : (
                    <Link href={`/exercises/${e.exerciseId}`} className="truncate hover:underline">
                      {e.name}
                    </Link>
                  )}
                  <span className="num shrink-0 font-semibold">{fmtNum(e.sets, 1)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Нічого за цей період.</p>
          )}
        </div>
        <div>
          <div className="caps mb-1">Чим пропрацювати</div>
          <ul className="space-y-1 text-sm">
            {suggestions.map((e) => (
              <li key={e.id} className="flex justify-between gap-3">
                <Link href={`/exercises/${e.id}`} className="truncate hover:underline">
                  {e.name}
                </Link>
                {e.done > 0 && <span className="shrink-0 text-xs text-muted">уже робили</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
