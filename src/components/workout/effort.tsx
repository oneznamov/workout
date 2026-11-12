"use client";

import { useState } from "react";
import { Gauge } from "lucide-react";
import { EFFORT_MAX, effortLevel } from "@/lib/effort";
import { cx } from "@/lib/format";

const STEPS = Array.from({ length: EFFORT_MAX }, (_, i) => i + 1);

/** Ten bars, one tap: how hard the workout felt. */
export function EffortScale({ value, onChange }: { value: number | null; onChange: (value: number) => void }) {
  const level = value != null ? effortLevel(value) : null;
  return (
    <div>
      <div role="radiogroup" aria-label="Наскільки важким було тренування, від 1 до 10" className="flex gap-1">
        {STEPS.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} з ${EFFORT_MAX} — ${effortLevel(n).label}`}
            onClick={() => onChange(n)}
            className="group flex h-[4.5rem] flex-1 flex-col items-center justify-end gap-1.5"
          >
            <span
              className={cx("w-full rounded-md transition-colors", value != null && n <= value ? level!.bg : "bg-surface-3 group-hover:bg-axis")}
              style={{ height: `${14 + n * 3}px` }}
            />
            <span className={cx("num text-xs", value === n ? "font-bold text-ink" : "text-muted")}>{n}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 min-h-5 text-sm" aria-live="polite">
        {level ? (
          <>
            <span className={cx("font-semibold", level.text)}>{level.label}</span>
            <span className="text-muted"> — {level.hint}</span>
          </>
        ) : (
          <span className="text-muted">1 — зовсім легко, 10 — на межі можливостей</span>
        )}
      </p>
    </div>
  );
}

/** On a finished workout: asks for the rating once, then shows it with a way to change it. */
export function EffortCard({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const level = value != null ? effortLevel(value) : null;
  if (level && !editing) {
    return (
      <section className="card flex items-center gap-3.5 px-4 py-3.5">
        <Gauge size={22} className={cx("shrink-0", level.text)} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-ink-2">Зусилля</div>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="num text-2xl font-semibold">
              {value}
              <span className="text-sm font-medium text-muted">/{EFFORT_MAX}</span>
            </span>
            <span className={cx("text-[15px] font-semibold", level.text)}>{level.label}</span>
          </div>
        </div>
        <button onClick={() => setEditing(true)} className="btn btn-sm btn-ghost shrink-0">
          Змінити
        </button>
      </section>
    );
  }
  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[17px] font-bold">
          <Gauge size={19} className="text-muted" /> Наскільки важко було?
        </h2>
        {value != null && (
          <button
            onClick={() => {
              onChange(null);
              setEditing(false);
            }}
            className="text-sm text-muted"
          >
            Прибрати
          </button>
        )}
      </div>
      <EffortScale
        value={value}
        onChange={(n) => {
          onChange(n);
          setEditing(false);
        }}
      />
      {value == null && <p className="text-xs text-muted">Оцінка зберігається разом із тренуванням — за нею видно, коли додати навантаження, а коли дати собі відпочити.</p>}
    </section>
  );
}

/** A small "7/10" for lists. */
export function EffortTag({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-1" title={`Зусилля: ${effortLevel(value).label}`}>
      <Gauge size={11} className={effortLevel(value).text} /> {value}/{EFFORT_MAX}
    </span>
  );
}
