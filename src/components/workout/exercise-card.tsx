"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowLeftRight, ArrowUp, Check, Minus, MoreHorizontal, Plus, Timer, Trash2 } from "lucide-react";
import type { SetType } from "@/db/schema";
import { cx, fmtClock, fmtDate } from "@/lib/format";
import { MUSCLE_LABEL, SET_TYPE_LABEL, SET_TYPE_SHORT } from "@/lib/labels";
import { describeSet, type CExercise, type CLast, type CSet } from "@/lib/shape";
import { ActionSheet, columnsFor, ExerciseThumb, NotesField, NumInput } from "./parts";

export const DEFAULT_REST = 90;
const REST_OPTIONS = [30, 45, 60, 90, 120, 150, 180, 240, 300];
const SET_TYPES: SetType[] = ["normal", "warmup", "drop", "failure"];

/** One exercise in the list view: sets table, with rare actions tucked into menus. */
export function ExerciseCard({
  e,
  tracked,
  last,
  first,
  lastInList,
  onMove,
  onRemove,
  onReplace,
  onRest,
  onNotes,
  onAddSet,
  onPatchSet,
  onToggleSet,
  onRemoveSet,
}: {
  e: CExercise;
  tracked: boolean;
  last: CLast[string] | undefined;
  first: boolean;
  lastInList: boolean;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
  onReplace: () => void;
  onRest: (v: number | null) => void;
  onNotes: (v: string | null) => void;
  onAddSet: () => void;
  onPatchSet: (setId: string, patch: Partial<CSet>) => void;
  onToggleSet: (s: CSet, index: number) => void;
  onRemoveSet: (setId: string) => void;
}) {
  const [menu, setMenu] = useState<"exercise" | { setId: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const t = e.exercise.tracking;
  const cols = columnsFor(t);
  const lastCol = tracked || editing;
  const grid =
    cols.length === 1
      ? lastCol
        ? "grid-cols-[3.25rem_1fr_3rem]"
        : "grid-cols-[3.25rem_1fr]"
      : lastCol
        ? "grid-cols-[3.25rem_1fr_1fr_3rem]"
        : "grid-cols-[3.25rem_1fr_1fr]";
  const menuSet = menu && menu !== "exercise" ? e.sets.find((s) => s.id === menu.setId) : undefined;
  let n = 0;

  return (
    <section className="card p-3.5 sm:p-4">
      <div className="flex items-center gap-3">
        <ExerciseThumb name={e.exercise.name} />
        <div className="min-w-0 flex-1">
          <Link href={`/exercises/${e.exercise.id}`} className="block truncate text-[17px] font-semibold hover:underline">
            {e.exercise.name}
          </Link>
          <div className="truncate text-xs text-muted">
            {e.exercise.nameUk ? `${e.exercise.nameUk} · ` : ""}
            {MUSCLE_LABEL[e.exercise.muscle]}
          </div>
        </div>
        <button onClick={() => setMenu("exercise")} aria-label={`Дії з вправою ${e.exercise.name}`} className="icon-btn bg-surface-2 text-ink-2">
          <MoreHorizontal size={20} />
        </button>
      </div>

      {last && last.sets.length > 0 && (
        <p className="mt-2 truncate text-xs text-muted">
          Минулого разу{last.date ? ` (${fmtDate(last.date)})` : ""}: {last.sets.map((s) => describeSet(t, s)).join(", ")}
        </p>
      )}

      <div className="mt-3 space-y-2">
        <div className={cx("caps grid items-center gap-2", grid)}>
          <span className="text-center">Підхід</span>
          {cols.map((c) => (
            <span key={c.key} className="text-center">
              {c.label}
            </span>
          ))}
          {lastCol && <span />}
        </div>
        {e.sets.map((s, idx) => {
          const label = s.type === "normal" ? String(++n) : SET_TYPE_SHORT[s.type];
          const prev = last?.sets[idx];
          return (
            <div key={s.id} className={cx("grid items-center gap-2", grid)}>
              <button
                onClick={() => setMenu({ setId: s.id })}
                aria-label={`Підхід ${idx + 1}: ${SET_TYPE_LABEL[s.type]}. Змінити тип або видалити`}
                className={cx(
                  "num mx-auto grid size-10 place-items-center rounded-full text-[15px] font-semibold",
                  s.type === "normal" ? "bg-surface-2 text-ink-2" : "bg-warning/20 text-warning",
                )}
              >
                {label}
              </button>
              {cols.map((c) => (
                <NumInput
                  key={c.key}
                  label={c.label}
                  decimal={c.decimal}
                  done={s.completed}
                  value={c.get(s)}
                  placeholder={prev && c.get(prev as CSet) != null ? String(c.get(prev as CSet)) : ""}
                  onChange={(v) => onPatchSet(s.id, c.set(v))}
                />
              ))}
              {editing ? (
                <button
                  onClick={() => onRemoveSet(s.id)}
                  aria-label={`Видалити підхід ${idx + 1}`}
                  className="grid size-12 place-items-center rounded-full bg-critical/15 text-critical transition active:scale-90"
                >
                  <Minus size={22} strokeWidth={3} />
                </button>
              ) : tracked ? (
                <button
                  onClick={() => onToggleSet(s, idx)}
                  role="checkbox"
                  aria-checked={s.completed}
                  aria-label="Підхід виконано"
                  className={cx(
                    "grid size-12 place-items-center rounded-full transition active:scale-90",
                    s.completed ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted hover:bg-surface-3",
                  )}
                >
                  <Check size={22} strokeWidth={3} />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <button onClick={onAddSet} className="btn btn-sm btn-ghost">
            <Plus size={15} /> Підхід
          </button>
          {e.sets.length > 0 && (
            <button onClick={() => setEditing((v) => !v)} aria-pressed={editing} className={cx("btn btn-sm", editing ? "btn-primary" : "btn-ghost")}>
              {editing ? "Готово" : "Видалити…"}
            </button>
          )}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <Timer size={15} /> Відпочинок
          <select
            value={e.restSeconds ?? ""}
            onChange={(ev) => onRest(ev.target.value ? Number(ev.target.value) : null)}
            className="num rounded-full bg-surface-2 px-2.5 py-1.5 text-[13px] text-ink outline-none"
          >
            <option value="">{fmtClock(DEFAULT_REST)}</option>
            {REST_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {fmtClock(r)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-2">
        <NotesField value={e.notes} placeholder="Нотатка до вправи" onSave={onNotes} />
      </div>

      {menu === "exercise" && (
        <ActionSheet
          title={e.exercise.name}
          onClose={() => setMenu(null)}
          actions={[
            { label: "Замінити вправу", icon: <ArrowLeftRight size={19} />, onSelect: onReplace },
            { label: "Перемістити вище", icon: <ArrowUp size={19} />, onSelect: () => onMove(-1), disabled: first },
            { label: "Перемістити нижче", icon: <ArrowDown size={19} />, onSelect: () => onMove(1), disabled: lastInList },
            { label: "Прибрати з тренування", icon: <Trash2 size={19} />, onSelect: onRemove, tone: "danger" },
          ]}
        />
      )}
      {menuSet && (
        <ActionSheet
          title={`Підхід ${e.sets.indexOf(menuSet) + 1}`}
          onClose={() => setMenu(null)}
          actions={[
            ...SET_TYPES.map((type) => ({
              label: SET_TYPE_LABEL[type],
              checked: menuSet.type === type,
              onSelect: () => onPatchSet(menuSet.id, { type }),
            })),
            { label: "Видалити підхід", icon: <Trash2 size={19} />, onSelect: () => onRemoveSet(menuSet.id), tone: "danger" as const },
          ]}
        />
      )}
    </section>
  );
}

/**
 * An exercise as plain text — for looking at a planned or finished workout without the risk
 * of changing a number by a stray tap. Editing is one button away on the workout itself.
 */
export function ExerciseSummary({ e, tracked }: { e: CExercise; tracked: boolean }) {
  const t = e.exercise.tracking;
  return (
    <section className="card p-3.5 sm:p-4">
      <div className="flex items-center gap-3">
        <ExerciseThumb name={e.exercise.name} />
        <div className="min-w-0 flex-1">
          <Link href={`/exercises/${e.exercise.id}`} className="block truncate text-[17px] font-semibold hover:underline">
            {e.exercise.name}
          </Link>
          <div className="truncate text-xs text-muted">
            {e.exercise.nameUk ? `${e.exercise.nameUk} · ` : ""}
            {MUSCLE_LABEL[e.exercise.muscle]}
            {e.restSeconds ? ` · відпочинок ${fmtClock(e.restSeconds)}` : ""}
          </div>
        </div>
      </div>
      {e.sets.length > 0 ? (
        <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Підходи">
          {e.sets.map((s, i) => (
            <li
              key={s.id}
              className={cx(
                "num flex items-center gap-1.5 rounded-xl bg-surface-2 px-2.5 py-1.5 text-[15px] font-medium",
                tracked && !s.completed && "text-muted line-through",
              )}
            >
              <span className="text-xs font-normal text-muted">{SET_TYPE_SHORT[s.type] || i + 1}</span>
              {describeSet(t, s)}
              {tracked && s.completed && <Check size={13} strokeWidth={3} className="text-accent" />}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-muted">Підходів ще немає.</p>
      )}
      {e.notes && <p className="mt-2.5 text-sm leading-snug whitespace-pre-line text-ink-2">{e.notes}</p>}
    </section>
  );
}
