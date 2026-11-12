"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeftRight, Check, ChevronRight, ChevronsUpDown, Flag, ListOrdered, Minus, MoreHorizontal, Plus, StickyNote, Trash2, Watch, X } from "lucide-react";
import { cx, fmtDate } from "@/lib/format";
import { MUSCLE_LABEL, SET_TYPE_LABEL } from "@/lib/labels";
import { suggestWeight } from "@/lib/progression";
import { describeSet, type CExercise, type CLast, type CSet, type CWorkout } from "@/lib/shape";
import { ActionSheet, columnsFor, ExerciseName, ExerciseThumb, NotesField, NumInput, RestScreen, useLockScroll } from "./parts";

/** What each big number is, spelled out with its unit. */
const COLUMN_NAME: Record<string, string> = { w: "Вага, кг", r: "Повторення", d: "Час, сек", km: "Дистанція, км", min: "Час, хв" };

/**
 * One thing at a time, on the whole screen — the same way the rest countdown looks: the set
 * to do now in huge digits with − and + beside them, one big "done" button under the thumb,
 * then the rest, then the next set. Nothing scrolls. The order is the athlete's: the list of
 * all exercises opens from the header (or the bottom row) and any of them can be done next.
 * Rarely needed actions live in a second sheet.
 */
export function FocusView({
  w,
  last,
  rest,
  bar,
  progress,
  onRestAdjust,
  onRestDone,
  onRestTick,
  onNotes,
  onPatchSet,
  onToggleSet,
  onAddSet,
  onRemoveSet,
  onReplace,
  onAddExercise,
  onFinish,
}: {
  w: CWorkout;
  last: CLast;
  rest: { endsAt: number; total: number } | null;
  /** The compact top row: back, workout clock, pause, list view, menu. */
  bar: ReactNode;
  progress: { done: number; total: number };
  onRestAdjust: (deltaSec: number) => void;
  onRestDone: (natural: boolean) => void;
  /** called on each of the last three seconds of a rest */
  onRestTick?: () => void;
  onNotes: (weId: string, notes: string | null) => void;
  onPatchSet: (weId: string, setId: string, patch: Partial<CSet>) => void;
  onToggleSet: (e: CExercise, s: CSet, index: number) => void;
  onAddSet: (e: CExercise) => void;
  onRemoveSet: (weId: string, setId: string) => void;
  onReplace: (weId: string) => void;
  onAddExercise: () => void;
  onFinish: () => void;
}) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"menu" | "queue" | "note" | null>(null);
  useLockScroll();

  const pending = w.exercises.filter((e) => e.sets.some((s) => !s.completed));
  const current = pending.find((e) => e.id === focusId) ?? pending[0];
  const index = current ? current.sets.findIndex((s) => !s.completed) : -1;
  const set = current && index >= 0 ? current.sets[index] : undefined;
  const prev = current ? last[current.exercise.id] : undefined;
  // "Went well last time → a little more today", for weighted sets only.
  const suggested = current && set && current.exercise.tracking === "weight_reps" ? suggestWeight(set, prev?.sets[index]) : null;
  const cols = current ? columnsFor(current.exercise.tracking) : [];
  // Cardio on a machine: the watch records the session, here it only needs ticking off.
  const cardio = current?.exercise.muscle === "cardio";
  // What comes after this exercise — the next unfinished one in the workout's order.
  const at = current ? pending.indexOf(current) : -1;
  const nextUp = current && pending.length > 1 ? pending[(at + 1) % pending.length] : undefined;

  const upNext = current && set && (
    <div className="flex w-full items-center gap-3 rounded-2xl bg-surface-2/90 p-3 text-left">
      <ExerciseThumb name={current.exercise.name} muscle={current.exercise.muscle} size={48} />
      <div className="min-w-0 flex-1">
        <div className="caps">Далі</div>
        <div className="truncate text-[17px] font-semibold">{current.exercise.name}</div>
        <div className="text-sm text-ink-2">
          Підхід {index + 1} з {current.sets.length} · <span className="num font-semibold text-ink">{describeSet(current.exercise.tracking, set, true)}</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-30 flex touch-none flex-col overflow-hidden overscroll-none bg-plane md:left-60">
        <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          {bar}
          <div
            className="mt-3 h-1.5 shrink-0 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-label="Виконано підходів"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
          >
            <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>

          {current && set ? (
            <>
              <div className="mt-5 flex items-center gap-3">
                <ExerciseThumb name={current.exercise.name} muscle={current.exercise.muscle} size={52} />
                <div className="min-w-0 flex-1">
                  <h2 className="text-[1.35rem] leading-tight font-bold">
                    <ExerciseName name={current.exercise.name} exerciseId={current.exercise.id} className="line-clamp-2" />
                  </h2>
                  <div className="truncate text-xs text-muted">
                    {current.exercise.nameUk ? `${current.exercise.nameUk} · ` : ""}
                    {MUSCLE_LABEL[current.exercise.muscle]}
                  </div>
                </div>
                <button onClick={() => setSheet("queue")} aria-label="Вибрати іншу вправу" title="Вибрати іншу вправу" className="icon-btn size-11 bg-surface-2 text-ink">
                  <ChevronsUpDown size={20} />
                </button>
              </div>

              <div className="mt-4 text-[1.6rem] leading-none font-bold">
                Підхід <span className="num text-accent">{index + 1}</span>
                <span className="num text-muted"> з {current.sets.length}</span>
              </div>
              {/* Every set of this exercise with its numbers: what is done, the one in hand, what is still ahead. */}
              <ol className="-mx-5 mt-2.5 flex shrink-0 touch-pan-x gap-1.5 overflow-x-auto px-5 [scrollbar-width:none]" aria-label="Підходи цієї вправи">
                {current.sets.map((s, i) => {
                  const text = cardio ? (s.durationSec ? `${Math.round(s.durationSec / 60)} хв` : "кардіо") : describeSet(current.exercise.tracking, s);
                  return (
                    <li
                      key={s.id}
                      aria-current={i === index ? "step" : undefined}
                      aria-label={`Підхід ${i + 1}: ${text}${s.completed ? ", виконано" : i === index ? ", зараз" : ", попереду"}`}
                      className={cx(
                        "num flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap",
                        s.completed ? "bg-accent/15 text-accent" : i === index ? "bg-ink text-plane" : "bg-surface-2 text-muted",
                      )}
                    >
                      {s.completed ? <Check size={13} strokeWidth={3} /> : <span className="opacity-60">{i + 1}</span>}
                      {text}
                    </li>
                  );
                })}
              </ol>
              {set.type !== "normal" && <span className="mt-2 self-start rounded-full bg-warning/20 px-2.5 py-0.5 text-xs font-semibold text-warning">{SET_TYPE_LABEL[set.type]}</span>}

              {cardio ? (
                <div className="flex min-h-0 flex-1 flex-col justify-center gap-4">
                  <p className="text-center text-sm text-ink-2">
                    <Watch size={15} className="-mt-0.5 mr-1.5 inline text-heart" />
                    Пульс, дистанцію й калорії візьмемо з Apple Watch. Тут досить натиснути «Готово» — решта за бажанням.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { label: "Час", unit: "хв", value: set.durationSec != null ? Math.round(set.durationSec / 6) / 10 : null, patch: (v: number | null) => ({ durationSec: v != null ? Math.round(v * 60) : null }) },
                        { label: "Швидкість", unit: "км/год", value: set.speedKmh ?? null, patch: (v: number | null) => ({ speedKmh: v }) },
                        { label: "Нахил", unit: "%", value: set.incline ?? null, patch: (v: number | null) => ({ incline: v }) },
                      ] as const
                    ).map((f) => (
                      <label key={f.label} className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface px-2 py-3">
                        <span className="caps">{f.label}</span>
                        <NumInput label={`${f.label}, ${f.unit}`} decimal value={f.value} placeholder="—" onChange={(v) => onPatchSet(current.id, set.id, f.patch(v))} />
                        <span className="text-xs text-muted">{f.unit}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
              /* The numbers of this set, as big as the rest countdown. */
              <div className="flex min-h-0 flex-1 flex-col justify-center gap-2.5">
                {cols.map((c) => {
                  // Two big numbers must not be mistaken for one another: each sits in its own panel
                  // under its own name, and the count (reps) is drawn in the accent colour.
                  const count = c.key === "r";
                  const fallback = (prev?.sets[index] ? c.get(prev.sets[index] as CSet) : null) ?? (index > 0 ? c.get(current.sets[index - 1]) : null) ?? 0;
                  const value = c.get(set);
                  const bump = (dir: 1 | -1) => {
                    const next = Math.max(0, Math.round(((value ?? fallback) + dir * c.step) * 100) / 100);
                    onPatchSet(current.id, set.id, c.set(next));
                  };
                  const name = COLUMN_NAME[c.key] ?? c.label;
                  return (
                    <div key={c.key} className={cx("rounded-[28px] px-2.5 pt-2.5 pb-2", count ? "bg-accent/[0.09] ring-1 ring-accent/30" : "bg-surface")}>
                      <div className={cx("caps text-center", count ? "text-accent" : "text-ink-2")}>{c.label === "+кг" ? "Додаткова вага, кг" : name}</div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => bump(-1)} aria-label={`Менше: ${name}`} className="icon-btn size-13 bg-surface-2 text-ink">
                          <Minus size={24} />
                        </button>
                        <div className="min-w-0 flex-1 text-center">
                          <NumInput
                            size="hero"
                            accent={count}
                            label={name}
                            decimal={c.decimal}
                            value={value}
                            placeholder={fallback ? String(fallback) : "0"}
                            onChange={(v) => onPatchSet(current.id, set.id, c.set(v))}
                          />
                        </div>
                        <button onClick={() => bump(1)} aria-label={`Більше: ${name}`} className="icon-btn size-13 bg-surface-2 text-ink">
                          <Plus size={24} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              )}

              {suggested != null ? (
                <button
                  onClick={() => onPatchSet(current.id, set.id, { weight: suggested })}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl bg-accent/12 px-3.5 py-2.5 text-left ring-1 ring-accent/40"
                >
                  <span className="min-w-0 text-sm text-ink-2">Минулого разу цей підхід вдався — додайте вагу</span>
                  <span className="num shrink-0 rounded-full bg-accent px-3 py-1 text-[15px] font-bold text-accent-ink">{suggested} кг</span>
                </button>
              ) : (
                prev &&
                !cardio &&
                prev.sets.length > 0 && (
                  <p className="truncate text-center text-xs text-muted">
                    Минулого разу{prev.date ? ` (${fmtDate(prev.date)})` : ""}: {prev.sets.map((s) => describeSet(current.exercise.tracking, s)).join(", ")}
                  </p>
                )
              )}
              {current.notes && <p className="mt-2 line-clamp-2 text-center text-sm text-ink-2">{current.notes}</p>}

              {/* A glance at what comes next; a tap opens the whole list. */}
              {nextUp && (
                <button onClick={() => setSheet("queue")} className="mt-3 flex w-full shrink-0 items-center gap-2.5 rounded-2xl bg-surface px-3 py-2 text-left">
                  <ExerciseThumb name={nextUp.exercise.name} muscle={nextUp.exercise.muscle} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="caps block">Далі</span>
                    <span className="block truncate text-[15px] font-semibold">{nextUp.exercise.name}</span>
                  </span>
                  <span className="num shrink-0 text-sm text-muted">
                    {nextUp.sets.filter((s) => !s.completed).length} × {describeSet(nextUp.exercise.tracking, nextUp.sets.find((s) => !s.completed) ?? nextUp.sets[0], true)}
                  </span>
                  <ChevronRight size={17} className="shrink-0 text-muted" />
                </button>
              )}

              <button onClick={() => onToggleSet(current, set, index)} className="btn btn-primary mt-4 h-16 w-full shrink-0 text-[19px]">
                <Check size={24} strokeWidth={3} /> Готово
              </button>
              <div className="mt-3 grid shrink-0 grid-cols-3 gap-2.5">
                <button onClick={() => setSheet("queue")} className="btn btn-ghost h-13 px-2 text-sm">
                  <ListOrdered size={17} /> Вправи
                </button>
                <button onClick={() => onAddSet(current)} className="btn btn-ghost h-13 px-2 text-sm">
                  <Plus size={17} /> Підхід
                </button>
                <button onClick={() => setSheet("menu")} aria-label="Інші дії з вправою" className="btn btn-ghost h-13 px-2 text-sm">
                  <MoreHorizontal size={19} /> Ще
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
              <h2 className="text-[1.75rem] leading-tight font-bold">{w.exercises.length ? "Усі підходи виконано" : "Додайте першу вправу"}</h2>
              {w.exercises.length > 0 && (
                <button onClick={onFinish} className="btn btn-primary h-16 w-full text-[19px]">
                  <Flag size={22} /> Завершити тренування
                </button>
              )}
              <button onClick={onAddExercise} className="btn btn-ghost h-12 w-full">
                <Plus size={18} /> Додати вправу
              </button>
            </div>
          )}
        </div>
      </div>

      {rest && (
        <RestScreen rest={rest} onAdjust={onRestAdjust} onDone={onRestDone} onTick={onRestTick}>
          {upNext}
        </RestScreen>
      )}

      {sheet === "queue" && (
        <ActionSheet
          title="Яку вправу робити зараз"
          onClose={() => setSheet(null)}
          actions={[
            // Every exercise of the workout, in its order: pick any unfinished one to do next.
            ...w.exercises.map((e) => {
              const done = e.sets.filter((s) => s.completed).length;
              const finished = e.sets.length > 0 && done === e.sets.length;
              return {
                label: `${e.exercise.name} · ${finished ? "виконано" : `${done} з ${e.sets.length}`}`,
                icon: finished ? <Check size={19} strokeWidth={3} className="text-accent" /> : undefined,
                checked: e.id === current?.id,
                disabled: finished || e.sets.length === 0,
                onSelect: () => setFocusId(e.id),
              };
            }),
            { label: "Додати вправу", icon: <Plus size={19} />, onSelect: onAddExercise },
          ]}
        />
      )}
      {sheet === "menu" && current && set && (
        <ActionSheet
          title={current.exercise.name}
          onClose={() => setSheet(null)}
          actions={[
            { label: current.notes ? "Змінити нотатку до вправи" : "Нотатка до вправи", icon: <StickyNote size={19} />, onSelect: () => setSheet("note") },
            { label: "Замінити вправу", icon: <ArrowLeftRight size={19} />, onSelect: () => onReplace(current.id) },
            { label: "Прибрати цей підхід", icon: <Trash2 size={19} />, onSelect: () => onRemoveSet(current.id, set.id), tone: "danger" as const },
            { label: "Завершити тренування", icon: <Flag size={19} />, onSelect: onFinish },
          ]}
        />
      )}
      {sheet === "note" && current && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 md:items-center md:p-6" onClick={() => setSheet(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Нотатка до вправи"
            className="w-full max-w-md space-y-3 rounded-t-[28px] bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:rounded-[28px] md:pb-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="truncate text-lg font-bold">{current.exercise.name}</h2>
              <button onClick={() => setSheet(null)} aria-label="Закрити" className="icon-btn bg-surface-2">
                <X size={20} />
              </button>
            </div>
            <NotesField key={current.id} value={current.notes} placeholder="Нотатка до вправи" startOpen onSave={(notes) => onNotes(current.id, notes)} />
            <button onClick={() => setSheet(null)} className="btn btn-primary w-full">
              Готово
            </button>
          </div>
        </div>
      )}
    </>
  );
}
