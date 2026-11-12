"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeftRight, Check, ChevronsUpDown, Flag, ListOrdered, Minus, MoreHorizontal, Plus, StickyNote, Trash2, X } from "lucide-react";
import { cx, fmtDate } from "@/lib/format";
import { MUSCLE_LABEL, SET_TYPE_LABEL } from "@/lib/labels";
import { suggestWeight } from "@/lib/progression";
import { describeSet, type CExercise, type CLast, type CSet, type CWorkout } from "@/lib/shape";
import { ActionSheet, columnsFor, ExerciseName, ExerciseThumb, NotesField, NumInput, RestScreen, useLockScroll } from "./parts";

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
        <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)]">
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

              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-[1.6rem] leading-none font-bold">
                  Підхід <span className="num text-accent">{index + 1}</span>
                  <span className="num text-muted"> з {current.sets.length}</span>
                </span>
                {/* Every set of this exercise as a dot: done, the one in hand, still ahead. */}
                <span className="flex items-center gap-1.5" aria-hidden="true">
                  {current.sets.map((s, i) => (
                    <span key={s.id} className={cx("size-2.5 rounded-full", s.completed ? "bg-accent" : i === index ? "bg-ink ring-2 ring-accent" : "bg-surface-3")} />
                  ))}
                </span>
              </div>
              {set.type !== "normal" && <span className="mt-2 self-start rounded-full bg-warning/20 px-2.5 py-0.5 text-xs font-semibold text-warning">{SET_TYPE_LABEL[set.type]}</span>}

              {/* The numbers of this set, as big as the rest countdown. */}
              <div className="flex min-h-0 flex-1 flex-col justify-center gap-1">
                {cols.map((c) => {
                  const fallback = (prev?.sets[index] ? c.get(prev.sets[index] as CSet) : null) ?? (index > 0 ? c.get(current.sets[index - 1]) : null) ?? 0;
                  const value = c.get(set);
                  const bump = (dir: 1 | -1) => {
                    const next = Math.max(0, Math.round(((value ?? fallback) + dir * c.step) * 100) / 100);
                    onPatchSet(current.id, set.id, c.set(next));
                  };
                  return (
                    <div key={c.key} className="flex items-center gap-2">
                      <button onClick={() => bump(-1)} aria-label={`Менше: ${c.label}`} className="icon-btn size-14 bg-surface-2 text-ink">
                        <Minus size={26} />
                      </button>
                      <div className="min-w-0 flex-1 text-center">
                        <NumInput
                          size="hero"
                          label={c.label}
                          decimal={c.decimal}
                          value={value}
                          placeholder={fallback ? String(fallback) : "0"}
                          onChange={(v) => onPatchSet(current.id, set.id, c.set(v))}
                        />
                        <div className="caps -mt-1">{c.label}</div>
                      </div>
                      <button onClick={() => bump(1)} aria-label={`Більше: ${c.label}`} className="icon-btn size-14 bg-surface-2 text-ink">
                        <Plus size={26} />
                      </button>
                    </div>
                  );
                })}
              </div>

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
                prev.sets.length > 0 && (
                  <p className="truncate text-center text-xs text-muted">
                    Минулого разу{prev.date ? ` (${fmtDate(prev.date)})` : ""}: {prev.sets.map((s) => describeSet(current.exercise.tracking, s)).join(", ")}
                  </p>
                )
              )}
              {current.notes && <p className="mt-2 line-clamp-2 text-center text-sm text-ink-2">{current.notes}</p>}

              <button onClick={() => onToggleSet(current, set, index)} className="btn btn-primary mt-3 h-16 w-full shrink-0 text-[19px]">
                <Check size={24} strokeWidth={3} /> Готово
              </button>
              <div className="mt-2 grid shrink-0 grid-cols-3 gap-2">
                <button onClick={() => setSheet("queue")} className="btn btn-ghost h-12 px-2 text-sm">
                  <ListOrdered size={17} /> Вправи
                </button>
                <button onClick={() => onAddSet(current)} className="btn btn-ghost h-12 px-2 text-sm">
                  <Plus size={17} /> Підхід
                </button>
                <button onClick={() => setSheet("menu")} aria-label="Інші дії з вправою" className="btn btn-ghost h-12 px-2 text-sm">
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
