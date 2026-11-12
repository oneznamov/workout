"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Plus, Search, X } from "lucide-react";
import { EQUIPMENT, MUSCLE_GROUPS, TRACKING, type Equipment, type MuscleGroup, type Tracking } from "@/db/schema";
import { createExerciseAction } from "@/lib/actions";
import { useLockScroll } from "@/lib/client/lock-scroll";
import { cx } from "@/lib/format";
import { EQUIPMENT_LABEL, MUSCLE_LABEL, TRACKING_LABEL } from "@/lib/labels";
import type { CExerciseInfo } from "@/lib/shape";

export function ExercisePicker({
  title = "Додати вправу",
  exercises,
  onPick,
  onClose,
}: {
  title?: string;
  exercises: CExerciseInfo[];
  onPick: (e: CExerciseInfo) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [creating, setCreating] = useState(false);
  const [extra, setExtra] = useState<CExerciseInfo[]>([]);

  useLockScroll();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...extra, ...exercises].filter(
      (e) =>
        (!muscle || e.muscle === muscle) &&
        (!needle || e.name.toLowerCase().includes(needle) || (e.nameUk ?? "").toLowerCase().includes(needle)),
    );
  }, [q, muscle, exercises, extra]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-[90dvh] w-full max-w-xl flex-col rounded-t-[28px] bg-surface md:h-[80dvh] md:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 p-4 pb-2">
          <h2 className="text-xl font-bold">{creating ? "Нова вправа" : title}</h2>
          <button onClick={onClose} aria-label="Закрити" className="icon-btn bg-surface-2">
            <X size={20} />
          </button>
        </div>

        {creating ? (
          <CreateForm
            initialName={q}
            onCancel={() => setCreating(false)}
            onCreated={(e) => {
              setExtra((x) => [e, ...x]);
              setCreating(false);
              onPick(e);
            }}
          />
        ) : (
          <>
            <div className="space-y-2 px-4 pb-2">
              <label className="relative block">
                <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Пошук вправи…"
                  className="field pl-9"
                  aria-label="Пошук вправи"
                />
              </label>
              <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                <Chip active={!muscle} onClick={() => setMuscle(null)}>
                  Усі
                </Chip>
                {MUSCLE_GROUPS.map((m) => (
                  <Chip key={m} active={muscle === m} onClick={() => setMuscle(muscle === m ? null : m)}>
                    {MUSCLE_LABEL[m]}
                  </Chip>
                ))}
              </div>
            </div>
            <ul className="flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
              {filtered.map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => onPick(e)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-medium">{e.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {e.nameUk ? `${e.nameUk} · ` : ""}
                        {MUSCLE_LABEL[e.muscle]} · {EQUIPMENT_LABEL[e.equipment]}
                      </span>
                    </span>
                    <Plus size={18} className="shrink-0 text-accent" />
                  </button>
                </li>
              ))}
              {filtered.length === 0 && <li className="p-6 text-center text-sm text-muted">Нічого не знайдено</li>}
            </ul>
            <div className="pb-safe border-t border-line p-3">
              <button onClick={() => setCreating(true)} className="btn btn-ghost w-full">
                <Plus size={16} /> Створити свою вправу
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap",
        active ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2 hover:bg-surface-3",
      )}
    >
      {children}
    </button>
  );
}

function CreateForm({
  initialName,
  onCancel,
  onCreated,
}: {
  initialName: string;
  onCancel: () => void;
  onCreated: (e: CExerciseInfo) => void;
}) {
  const [name, setName] = useState(initialName);
  const [muscle, setMuscle] = useState<MuscleGroup>("chest");
  const [equipment, setEquipment] = useState<Equipment>("barbell");
  const [tracking, setTracking] = useState<Tracking>("weight_reps");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex-1 space-y-4 overflow-y-auto p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          try {
            onCreated(await createExerciseAction({ name, muscle, equipment, tracking }));
          } catch {
            setError("Не вдалося створити вправу");
          }
        });
      }}
    >
      <label className="block space-y-1.5">
        <span className="text-sm text-ink-2">Назва</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} className="field" autoFocus />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm text-ink-2">Група м&apos;язів</span>
        <select value={muscle} onChange={(e) => setMuscle(e.target.value as MuscleGroup)} className="field">
          {MUSCLE_GROUPS.map((m) => (
            <option key={m} value={m}>
              {MUSCLE_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm text-ink-2">Обладнання</span>
        <select value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)} className="field">
          {EQUIPMENT.map((m) => (
            <option key={m} value={m}>
              {EQUIPMENT_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm text-ink-2">Що записуємо</span>
        <select value={tracking} onChange={(e) => setTracking(e.target.value as Tracking)} className="field">
          {TRACKING.map((m) => (
            <option key={m} value={m}>
              {TRACKING_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="text-sm text-critical">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn btn-ghost flex-1">
          Назад
        </button>
        <button type="submit" disabled={pending} className="btn btn-primary flex-1">
          {pending ? "Створення…" : "Створити й додати"}
        </button>
      </div>
    </form>
  );
}
