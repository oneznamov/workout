"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Check, ChevronDown, ChevronRight, Flag, Minus, MoreHorizontal, Plus, SkipForward, Trash2 } from "lucide-react";
import { cx, fmtDate, plural, SETS_FORMS } from "@/lib/format";
import { MUSCLE_LABEL, SET_TYPE_LABEL } from "@/lib/labels";
import { describeSet, type CExercise, type CLast, type CSet, type CWorkout } from "@/lib/shape";
import { ActionSheet, columnsFor, ExerciseThumb, NotesField, NumInput, RestScreen } from "./parts";

/**
 * One thing at a time: the set to do now with big controls and a "done" button that stays
 * under the thumb, then a full-screen rest countdown, then the next set. Everything else —
 * the queue of other exercises, adding one — is folded away below until asked for.
 */
export function FocusView({
  w,
  last,
  rest,
  onRestAdjust,
  onRestDone,
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
  onRestAdjust: (deltaSec: number) => void;
  onRestDone: (natural: boolean) => void;
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
  const [menu, setMenu] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const resting = rest != null;
  // When the rest ends, the next set is waiting at the top of the screen.
  useEffect(() => {
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [resting]);

  const pending = w.exercises.filter((e) => e.sets.some((s) => !s.completed));
  const current = pending.find((e) => e.id === focusId) ?? pending[0];
  const index = current ? current.sets.findIndex((s) => !s.completed) : -1;
  const set = current && index >= 0 ? current.sets[index] : undefined;
  const others = pending.filter((e) => e.id !== current?.id);
  const finished = w.exercises.filter((e) => e.sets.length > 0 && e.sets.every((s) => s.completed));
  const prev = current ? last[current.exercise.id] : undefined;

  const upNext = current && set && (
    <div className="flex w-full items-center gap-3 rounded-2xl bg-surface-2/90 p-3 text-left">
      <ExerciseThumb name={current.exercise.name} size={48} />
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
    <div ref={top} className="scroll-mt-[calc(5rem+env(safe-area-inset-top))] space-y-4 md:scroll-mt-6">
      {rest && (
        <RestScreen rest={rest} onAdjust={onRestAdjust} onDone={onRestDone}>
          {upNext}
        </RestScreen>
      )}
      {current && set ? (
        <section className="card p-4">
          <div className="flex items-center gap-3">
            <ExerciseThumb name={current.exercise.name} size={56} />
            <div className="min-w-0 flex-1">
              <h2 className="line-clamp-2 text-[1.35rem] leading-tight font-bold">{current.exercise.name}</h2>
              <div className="truncate text-xs text-muted">
                {current.exercise.nameUk ? `${current.exercise.nameUk} · ` : ""}
                {MUSCLE_LABEL[current.exercise.muscle]}
              </div>
            </div>
            <button onClick={() => setMenu(true)} aria-label="Дії з вправою" className="icon-btn bg-surface-2 text-ink-2">
              <MoreHorizontal size={20} />
            </button>
          </div>

          {/* Every set of this exercise at a glance: done, the one in hand, still ahead. */}
          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[1.6rem] leading-none font-bold">
                Підхід <span className="num text-accent">{index + 1}</span>
                <span className="num text-muted"> з {current.sets.length}</span>
              </span>
              {set.type !== "normal" && <span className="rounded-full bg-warning/20 px-2.5 py-0.5 text-xs font-semibold text-warning">{SET_TYPE_LABEL[set.type]}</span>}
            </div>
            <ol className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Підходи цієї вправи">
              {current.sets.map((s, i) => (
                <li
                  key={s.id}
                  aria-current={i === index ? "step" : undefined}
                  className={cx(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                    s.completed ? "bg-accent/15 text-ink-2" : i === index ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted",
                  )}
                >
                  {s.completed ? <Check size={13} strokeWidth={3} className="text-accent" /> : <span className="num font-semibold">{i + 1}</span>}
                  <span className="num">{describeSet(current.exercise.tracking, s)}</span>
                </li>
              ))}
            </ol>
          </div>

          {prev && prev.sets.length > 0 && (
            <p className="mt-2.5 truncate text-xs text-muted">
              Минулого разу{prev.date ? ` (${fmtDate(prev.date)})` : ""}: {prev.sets.map((s) => describeSet(current.exercise.tracking, s)).join(", ")}
            </p>
          )}

          <div className={cx("mt-3 grid gap-3", columnsFor(current.exercise.tracking).length > 1 && "sm:grid-cols-2")}>
            {columnsFor(current.exercise.tracking).map((c) => {
              const fallback = (prev?.sets[index] ? c.get(prev.sets[index] as CSet) : null) ?? (index > 0 ? c.get(current.sets[index - 1]) : null) ?? 0;
              const value = c.get(set);
              const bump = (dir: 1 | -1) => {
                const next = Math.max(0, Math.round(((value ?? fallback) + dir * c.step) * 100) / 100);
                onPatchSet(current.id, set.id, c.set(next));
              };
              return (
                <div key={c.key} className="rounded-2xl bg-surface-2 p-2">
                  <div className="caps text-center">{c.label}</div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => bump(-1)} aria-label={`Менше: ${c.label}`} className="icon-btn size-12 bg-surface-3 text-ink">
                      <Minus size={22} />
                    </button>
                    <NumInput
                      size="xl"
                      label={c.label}
                      decimal={c.decimal}
                      value={value}
                      placeholder={fallback ? String(fallback) : "0"}
                      onChange={(v) => onPatchSet(current.id, set.id, c.set(v))}
                    />
                    <button onClick={() => bump(1)} aria-label={`Більше: ${c.label}`} className="icon-btn size-12 bg-surface-3 text-ink">
                      <Plus size={22} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stays at the bottom of the screen while the card scrolls — always under the thumb. */}
          <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-20 mt-4 md:bottom-4">
            <button
              onClick={() => onToggleSet(current, set, index)}
              className="btn btn-primary h-16 w-full text-[19px] shadow-[0_10px_30px_rgba(0,0,0,0.55)]"
            >
              <Check size={24} strokeWidth={3} /> Готово
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button onClick={() => onRemoveSet(current.id, set.id)} className="btn btn-sm btn-ghost text-ink-2">
              <Trash2 size={15} /> Прибрати підхід
            </button>
            <button onClick={() => onAddSet(current)} className="btn btn-sm btn-ghost text-ink-2">
              <Plus size={15} /> Ще підхід
            </button>
          </div>

          <div className="mt-3">
            <NotesField key={current.id} value={current.notes} placeholder="Нотатка до вправи" onSave={(notes) => onNotes(current.id, notes)} />
          </div>
        </section>
      ) : (
        <section className="card space-y-3 p-5 text-center">
          <h2 className="text-xl font-bold">{w.exercises.length ? "Усі підходи виконано" : "Додайте першу вправу"}</h2>
          {w.exercises.length > 0 && (
            <button onClick={onFinish} className="btn btn-primary w-full">
              <Flag size={18} /> Завершити тренування
            </button>
          )}
        </section>
      )}

      {/* Everything that is not "this set, now" lives in one folded block. */}
      {others.length > 0 ? (
        <details className="card group overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center gap-3 p-3.5 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1">
              <span className="caps block">Черга · {plural(others.length, ["вправа", "вправи", "вправ"])}</span>
              <span className="block truncate text-[15px] font-medium text-ink-2">Потім: {others[0].exercise.name}</span>
            </span>
            <ChevronDown size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className="divide-y divide-line border-t border-line">
            {others.map((e) => {
              const left = e.sets.filter((s) => !s.completed);
              return (
                <div key={e.id} className="flex items-center gap-3 p-3">
                  <ExerciseThumb name={e.exercise.name} size={44} />
                  <button onClick={() => setFocusId(e.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{e.exercise.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {e.sets.length === left.length ? plural(left.length, SETS_FORMS) : `залишилось ${left.length} з ${e.sets.length}`} ·{" "}
                        {describeSet(e.exercise.tracking, left[0], true)}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-accent">Зараз</span>
                    <ChevronRight size={18} className="shrink-0 text-muted" />
                  </button>
                </div>
              );
            })}
            <div className="p-3">
              <button onClick={onAddExercise} className="btn btn-ghost btn-sm w-full">
                <Plus size={16} /> Додати вправу
              </button>
            </div>
          </div>
        </details>
      ) : (
        <button onClick={onAddExercise} className="btn btn-ghost w-full">
          <Plus size={18} /> Додати вправу
        </button>
      )}

      {finished.length > 0 && <p className="px-1 text-xs text-muted">Виконано: {finished.map((e) => e.exercise.name).join(", ")}</p>}

      {menu && current && (
        <ActionSheet
          title={current.exercise.name}
          onClose={() => setMenu(false)}
          actions={[
            {
              label: "Відкласти вправу на потім",
              icon: <SkipForward size={19} />,
              onSelect: () => setFocusId(others[0]?.id ?? null),
              disabled: others.length === 0,
            },
            { label: "Замінити вправу", icon: <ArrowLeftRight size={19} />, onSelect: () => onReplace(current.id) },
          ]}
        />
      )}
    </div>
  );
}
