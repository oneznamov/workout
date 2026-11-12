"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Check, ChevronRight, Flag, Minus, MoreHorizontal, Plus, SkipForward, Trash2 } from "lucide-react";
import { cx, fmtDate, plural, SETS_FORMS } from "@/lib/format";
import { MUSCLE_LABEL, SET_TYPE_LABEL } from "@/lib/labels";
import { describeSet, type CExercise, type CLast, type CSet, type CWorkout } from "@/lib/shape";
import { ActionSheet, columnsFor, ExerciseThumb, NumInput, RestRing } from "./parts";

/**
 * One thing at a time: the set to do now with big controls, then the rest countdown,
 * then the next set. The queue below lets you jump to any other exercise — the order
 * you do them in is up to you.
 */
export function FocusView({
  w,
  last,
  rest,
  onRestAdjust,
  onRestDone,
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
  // Bring the countdown (or the next set) to the top of the screen when the phase changes.
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
    <div className="mt-4 w-full rounded-2xl bg-surface-2 p-3 text-left">
      <div className="caps">Далі</div>
      <div className="truncate text-[15px] font-semibold">{current.exercise.name}</div>
      <div className="text-xs text-muted">
        підхід {index + 1} з {current.sets.length} · {describeSet(current.exercise.tracking, set)}
      </div>
    </div>
  );

  return (
    <div ref={top} className="scroll-mt-[calc(5rem+env(safe-area-inset-top))] space-y-4 md:scroll-mt-6">
      {rest ? (
        <RestRing rest={rest} onAdjust={onRestAdjust} onDone={onRestDone}>
          {upNext}
        </RestRing>
      ) : current && set ? (
        <section className="card p-4">
          <div className="flex items-center gap-3">
            <ExerciseThumb name={current.exercise.name} size={56} />
            <div className="min-w-0 flex-1">
              <div className="caps text-accent">
                Підхід {index + 1} з {current.sets.length}
                {set.type !== "normal" && ` · ${SET_TYPE_LABEL[set.type].toLowerCase()}`}
              </div>
              <h2 className="truncate text-[1.35rem] leading-tight font-bold">{current.exercise.name}</h2>
              <div className="truncate text-xs text-muted">
                {current.exercise.nameUk ? `${current.exercise.nameUk} · ` : ""}
                {MUSCLE_LABEL[current.exercise.muscle]}
              </div>
            </div>
            <button onClick={() => setMenu(true)} aria-label="Дії з підходом і вправою" className="icon-btn bg-surface-2 text-ink-2">
              <MoreHorizontal size={20} />
            </button>
          </div>

          {prev && prev.sets.length > 0 && (
            <p className="mt-2 truncate text-xs text-muted">
              Минулого разу{prev.date ? ` (${fmtDate(prev.date)})` : ""}: {prev.sets.map((s) => describeSet(current.exercise.tracking, s)).join(", ")}
            </p>
          )}

          <div className={cx("mt-4 grid gap-3", columnsFor(current.exercise.tracking).length > 1 && "sm:grid-cols-2")}>
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

          <button onClick={() => onToggleSet(current, set, index)} className="btn btn-primary mt-4 h-14 w-full text-[17px]">
            <Check size={22} strokeWidth={3} /> Готово
          </button>
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

      {others.length > 0 && (
        <section>
          <h3 className="caps mb-2 px-1">Черга · натисніть, щоб робити зараз</h3>
          <div className="card divide-y divide-line overflow-hidden">
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
                        {describeSet(e.exercise.tracking, left[0])}
                      </span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-muted" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {finished.length > 0 && (
        <p className="px-1 text-xs text-muted">
          Виконано: {finished.map((e) => e.exercise.name).join(", ")}
        </p>
      )}

      <button onClick={onAddExercise} className="btn btn-ghost w-full">
        <Plus size={18} /> Додати вправу
      </button>

      {menu && current && set && (
        <ActionSheet
          title={current.exercise.name}
          onClose={() => setMenu(false)}
          actions={[
            { label: "Додати ще підхід", icon: <Plus size={19} />, onSelect: () => onAddSet(current) },
            {
              label: "Відкласти вправу на потім",
              icon: <SkipForward size={19} />,
              onSelect: () => setFocusId(others[0]?.id ?? null),
              disabled: others.length === 0,
            },
            { label: "Замінити вправу", icon: <ArrowLeftRight size={19} />, onSelect: () => onReplace(current.id) },
            { label: "Пропустити цей підхід", icon: <Trash2 size={19} />, onSelect: () => onRemoveSet(current.id, set.id), tone: "danger" },
          ]}
        />
      )}
    </div>
  );
}
