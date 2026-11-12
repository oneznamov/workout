"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bike, Check, Dumbbell, Minus, Pencil, Plus } from "lucide-react";
import { saveGoalsAction } from "@/lib/actions";
import { DEFAULT_GOALS, GOAL_LIMITS, type Goals } from "@/lib/goals";
import { Rings } from "./rings";

const FIELDS: { key: keyof Goals; label: string; unit: string; color: string }[] = [
  { key: "workouts", label: "Силові тренування", unit: "на тиждень", color: "var(--c-strength)" },
  { key: "cardioMin", label: "Кардіо", unit: "хв на тиждень", color: "var(--c-run)" },
  { key: "muscles", label: "Груп мʼязів у нормі", unit: "з 11", color: "var(--c-cycle)" },
];

/** Weekly goal rings with an inline editor for the targets. */
export function GoalsCard({ values, goals: saved }: { values: Goals; goals: Goals }) {
  const router = useRouter();
  const [goals, setGoals] = useState(saved);
  const [draft, setDraft] = useState(saved);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();

  const step = (key: keyof Goals, dir: 1 | -1) =>
    setDraft((d) => {
      const { min, max, step: s } = GOAL_LIMITS[key];
      return { ...d, [key]: Math.min(max, Math.max(min, d[key] + dir * s)) };
    });

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Цілі тижня</h2>
        {editing ? (
          <button type="button" onClick={() => setDraft(DEFAULT_GOALS)} className="text-xs text-accent">
            Скинути до типових
          </button>
        ) : (
          <button
            onClick={() => {
              setDraft(goals);
              setError(false);
              setEditing(true);
            }}
            className="flex items-center gap-1.5 text-xs text-accent"
          >
            <Pencil size={13} /> Змінити
          </button>
        )}
      </div>

      {!editing ? (
        <Rings
          rings={[
            { label: "Силові", value: values.workouts, goal: goals.workouts, unit: "трен.", color: "var(--c-strength)", icon: <Dumbbell size={14} /> },
            { label: "Кардіо", value: values.cardioMin, goal: goals.cardioMin, unit: "хв", color: "var(--c-run)", icon: <Bike size={14} /> },
            { label: "Мʼязи в нормі", value: values.muscles, goal: goals.muscles, unit: "груп", color: "var(--c-cycle)", icon: <Check size={14} strokeWidth={3} /> },
          ]}
        />
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(false);
            start(async () => {
              try {
                setGoals(await saveGoalsAction(draft));
                setEditing(false);
                router.refresh();
              } catch {
                setError(true);
              }
            });
          }}
        >
          {FIELDS.map((f) => {
            const { min, max } = GOAL_LIMITS[f.key];
            return (
              <div key={f.key} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold" style={{ color: f.color }}>
                    {f.label}
                  </div>
                  <div className="text-xs text-muted">{f.unit}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => step(f.key, -1)}
                    disabled={draft[f.key] <= min}
                    aria-label={`Зменшити: ${f.label}`}
                    className="icon-btn bg-surface-2 text-ink"
                  >
                    <Minus size={18} />
                  </button>
                  <output className="num w-14 text-center text-xl font-semibold" aria-live="polite">
                    {draft[f.key]}
                  </output>
                  <button
                    type="button"
                    onClick={() => step(f.key, 1)}
                    disabled={draft[f.key] >= max}
                    aria-label={`Збільшити: ${f.label}`}
                    className="icon-btn bg-surface-2 text-ink"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>
            );
          })}
          {error && (
            <p role="alert" className="text-sm text-critical">
              Не вдалося зберегти — перевірте звʼязок.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button type="button" onClick={() => setEditing(false)} className="btn btn-ghost">
              Скасувати
            </button>
            <button type="submit" disabled={pending} className="btn btn-primary">
              {pending ? "Збереження…" : "Зберегти"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
