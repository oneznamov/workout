"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CloudOff,
  Copy,
  Flag,
  Heart,
  Play,
  Plus,
  RotateCcw,
  Save,
  StickyNote,
  Timer,
  Trash2,
  Watch,
  X,
} from "lucide-react";
import type { SetType, Tracking } from "@/db/schema";
import {
  addExerciseAction,
  addSetAction,
  deleteSetAction,
  deleteWorkoutAction,
  duplicateWorkoutAction,
  finishWorkoutAction,
  linkHealthWorkoutAction,
  removeWorkoutExerciseAction,
  reorderExercisesAction,
  resumeWorkoutAction,
  startWorkoutAction,
  updateSetAction,
  updateWorkoutAction,
  updateWorkoutExerciseAction,
} from "@/lib/actions";
import { cx, EXERCISES_FORMS, fmtClock, fmtDate, fmtDateLong, fmtDuration, fmtNum, fmtTime, plural } from "@/lib/format";
import { MUSCLE_LABEL, SET_TYPE_LABEL, SET_TYPE_SHORT, STATUS_LABEL } from "@/lib/labels";
import { describeSet, type CExercise, type CExerciseInfo, type CLast, type CSet, type CWorkout } from "@/lib/shape";
import { Badge } from "../ui";
import { TrendChart } from "../charts";
import { ExercisePicker } from "./exercise-picker";

const DEFAULT_REST = 90;
const REST_OPTIONS = [30, 45, 60, 90, 120, 150, 180, 240, 300];
const SET_TYPE_ORDER: SetType[] = ["normal", "warmup", "drop", "failure"];

type HealthCandidate = { id: string; activityType: string; startAt: string; durationSec: number | null; avgHr: number | null };

export function WorkoutEditor({
  initial,
  last,
  exercises,
  healthCandidates,
}: {
  initial: CWorkout;
  last: CLast;
  exercises: CExerciseInfo[];
  healthCandidates: HealthCandidate[];
}) {
  const [w, setW] = useState(initial);
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [rest, setRest] = useState<{ endsAt: number; total: number } | null>(null);
  const [navPending, startNav] = useTransition();

  const live = w.status === "in_progress";
  const done = w.status === "completed";
  const tracked = live || done; // sets carry a "completed" checkbox

  // ── Persistence: a serial queue of server actions + debounced set edits ──
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);
  const timers = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; patch: Partial<CSet> }>());
  const audio = useRef<AudioContext | null>(null);

  const run = useCallback((fn: () => Promise<unknown>) => {
    pending.current++;
    setSaving(true);
    queue.current = queue.current
      .then(fn)
      .then(() => setFailed(false))
      .catch(() => setFailed(true))
      .finally(() => {
        pending.current--;
        if (pending.current === 0) setSaving(false);
      });
    return queue.current;
  }, []);

  const flushSet = useCallback(
    (setId: string) => {
      const t = timers.current.get(setId);
      if (!t) return;
      clearTimeout(t.timer);
      timers.current.delete(setId);
      run(() => updateSetAction(setId, t.patch));
    },
    [run],
  );
  const flushAll = useCallback(() => {
    for (const id of [...timers.current.keys()]) flushSet(id);
  }, [flushSet]);

  const sync = useCallback(async () => {
    if (pending.current || timers.current.size) return;
    try {
      const r = await fetch(`/api/workouts/${initial.id}`, { cache: "no-store" });
      if (!r.ok) return;
      const fresh = (await r.json()) as CWorkout;
      if (pending.current || timers.current.size) return;
      setW(fresh);
    } catch {
      /* offline — keep local state */
    }
  }, [initial.id]);

  // Pull remote changes (e.g. Claude editing the plan mid-workout).
  useEffect(() => {
    const iv = setInterval(() => !document.hidden && sync(), 15000);
    const onVis = () => !document.hidden && sync();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flushAll);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", flushAll);
      flushAll();
    };
  }, [sync, flushAll]);

  // ── Local state helpers ──
  const mapExercise = (weId: string, fn: (e: CExercise) => CExercise) =>
    setW((cur) => ({ ...cur, exercises: cur.exercises.map((e) => (e.id === weId ? fn(e) : e)) }));

  const patchSet = (weId: string, setId: string, patch: Partial<CSet>, immediate = false) => {
    mapExercise(weId, (e) => ({ ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) }));
    const prev = timers.current.get(setId);
    if (prev) clearTimeout(prev.timer);
    const merged = { ...prev?.patch, ...patch };
    timers.current.set(setId, { patch: merged, timer: setTimeout(() => flushSet(setId), 700) });
    if (immediate) flushSet(setId);
  };

  const addExercise = (info: CExerciseInfo) => {
    setPicker(false);
    const prev = last[info.id]?.sets ?? [];
    const template = prev.length ? prev : [null, null, null];
    const item: CExercise = {
      id: crypto.randomUUID(),
      exercise: info,
      restSeconds: null,
      notes: null,
      sets: template.map((p) => ({
        id: crypto.randomUUID(),
        type: p?.type ?? "normal",
        weight: p?.weight ?? null,
        reps: p?.reps ?? null,
        durationSec: p?.durationSec ?? null,
        distanceM: p?.distanceM ?? null,
        completed: false,
      })),
    };
    setW((cur) => ({ ...cur, exercises: [...cur.exercises, item] }));
    run(() =>
      addExerciseAction(w.id, {
        id: item.id,
        exerciseId: info.id,
        sets: item.sets.map((s) => ({ ...s, completed: false })),
      }),
    );
  };

  const removeExercise = (weId: string) => {
    if (!window.confirm("Прибрати вправу з тренування?")) return;
    setW((cur) => ({ ...cur, exercises: cur.exercises.filter((e) => e.id !== weId) }));
    run(() => removeWorkoutExerciseAction(weId));
  };

  const moveExercise = (weId: string, dir: -1 | 1) => {
    const i = w.exercises.findIndex((e) => e.id === weId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= w.exercises.length) return;
    const next = [...w.exercises];
    [next[i], next[j]] = [next[j], next[i]];
    setW((cur) => ({ ...cur, exercises: next }));
    run(() => reorderExercisesAction(w.id, next.map((e) => e.id)));
  };

  const addSet = (e: CExercise) => {
    const prev = e.sets[e.sets.length - 1];
    const s: CSet = {
      id: crypto.randomUUID(),
      type: prev?.type === "warmup" ? "normal" : (prev?.type ?? "normal"),
      weight: prev?.weight ?? null,
      reps: prev?.reps ?? null,
      durationSec: prev?.durationSec ?? null,
      distanceM: prev?.distanceM ?? null,
      completed: false,
    };
    mapExercise(e.id, (x) => ({ ...x, sets: [...x.sets, s] }));
    run(() => addSetAction(e.id, s));
  };

  const removeSet = (weId: string, setId: string) => {
    const t = timers.current.get(setId);
    if (t) {
      clearTimeout(t.timer);
      timers.current.delete(setId);
    }
    mapExercise(weId, (e) => ({ ...e, sets: e.sets.filter((s) => s.id !== setId) }));
    run(() => deleteSetAction(setId));
  };

  const toggleSet = (e: CExercise, s: CSet, index: number) => {
    const completed = !s.completed;
    const patch: Partial<CSet> = { completed };
    if (completed) {
      // Fill blanks from the previous session so a tap is enough to log the set.
      const p = last[e.exercise.id]?.sets[index];
      if (p) {
        if (s.weight == null && p.weight != null) patch.weight = p.weight;
        if (s.reps == null && p.reps != null) patch.reps = p.reps;
        if (s.durationSec == null && p.durationSec != null) patch.durationSec = p.durationSec;
        if (s.distanceM == null && p.distanceM != null) patch.distanceM = p.distanceM;
      }
    }
    patchSet(e.id, s.id, patch, true);
    if (live && completed) {
      audio.current ??= createAudio();
      const total = e.restSeconds ?? DEFAULT_REST;
      setRest(restFor(total));
    }
  };

  const finish = async () => {
    setConfirmFinish(false);
    setRest(null);
    flushAll();
    await run(() => finishWorkoutAction(w.id));
    await sync();
  };

  const resume = async () => {
    await run(() => resumeWorkoutAction(w.id));
    await sync();
  };

  const totalSets = w.exercises.reduce((a, e) => a + e.sets.length, 0);
  const doneSets = w.exercises.reduce((a, e) => a + e.sets.filter((s) => s.completed).length, 0);
  const volume = w.exercises.reduce(
    (a, e) => a + e.sets.filter((s) => s.completed).reduce((b, s) => b + (s.weight ?? 0) * (s.reps ?? 0), 0),
    0,
  );

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted">
          <Link href="/workouts" className="hover:text-ink">
            ← Тренування
          </Link>
          <Badge tone={live ? "accent" : done ? "good" : "neutral"}>{STATUS_LABEL[w.status]}</Badge>
          <span className="ml-auto flex items-center gap-1" aria-live="polite">
            {failed ? (
              <button onClick={() => sync()} className="flex items-center gap-1 text-critical">
                <CloudOff size={14} /> Не збережено — оновити
              </button>
            ) : saving ? (
              "Збереження…"
            ) : (
              "Збережено"
            )}
          </span>
        </div>
        <input
          value={w.name}
          onChange={(e) => setW((cur) => ({ ...cur, name: e.target.value }))}
          onBlur={() => run(() => updateWorkoutAction(w.id, { name: w.name }))}
          aria-label="Назва тренування"
          className="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-muted"
          placeholder="Назва тренування"
        />

        {live && w.startedAt && (
          <div className="card flex items-center justify-between gap-3 p-4">
            <div>
              <div className="text-xs text-muted">Час тренування · почато о {fmtTime(w.startedAt)}</div>
              <Elapsed since={w.startedAt} />
            </div>
            <div className="text-right">
              <div className="text-xs text-muted">Підходи</div>
              <div className="tabular text-xl font-semibold">
                {doneSets}
                <span className="text-muted">/{totalSets}</span>
              </div>
            </div>
            <button onClick={() => setConfirmFinish(true)} className="btn btn-primary">
              <Flag size={16} /> Завершити
            </button>
          </div>
        )}

        {done && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini label="Дата" value={fmtDate(w.startedAt, { day: "numeric", month: "short" })} hint={`${fmtDate(w.startedAt, { weekday: "short", year: "numeric" })} · ${fmtTime(w.startedAt)}–${fmtTime(w.endedAt)}`} />
            <Mini
              label="Тривалість"
              value={w.startedAt && w.endedAt ? fmtDuration((+new Date(w.endedAt) - +new Date(w.startedAt)) / 1000) : "—"}
            />
            <Mini label="Підходи" value={String(doneSets)} hint={plural(w.exercises.length, EXERCISES_FORMS)} />
            <Mini label="Тоннаж" value={`${fmtNum(volume)} кг`} />
          </div>
        )}

        {w.status === "planned" && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-ink-2">
              Дата
              <input
                type="date"
                value={w.scheduledFor ?? ""}
                onChange={(e) => {
                  const v = e.target.value || null;
                  setW((cur) => ({ ...cur, scheduledFor: v }));
                  run(() => updateWorkoutAction(w.id, { scheduledFor: v }));
                }}
                className="field w-auto py-1.5"
              />
            </label>
            {w.scheduledFor && <span className="text-sm text-muted">{fmtDateLong(w.scheduledFor)}</span>}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(w.status === "planned" || w.status === "template") && (
            <button
              disabled={navPending}
              onClick={() => {
                flushAll();
                startNav(async () => {
                  await queue.current;
                  await startWorkoutAction(w.id);
                });
              }}
              className="btn btn-primary"
            >
              <Play size={16} /> Почати тренування
            </button>
          )}
          {done && (
            <>
              <button disabled={navPending} onClick={() => startNav(() => duplicateWorkoutAction(w.id, "in_progress"))} className="btn btn-primary">
                <RotateCcw size={16} /> Повторити зараз
              </button>
              <button disabled={navPending} onClick={() => startNav(() => duplicateWorkoutAction(w.id, "planned"))} className="btn btn-ghost">
                <Copy size={16} /> Запланувати копію
              </button>
              <button onClick={resume} className="btn btn-ghost">
                <Play size={16} /> Продовжити
              </button>
            </>
          )}
          {w.status !== "template" && (
            <button disabled={navPending} onClick={() => startNav(() => duplicateWorkoutAction(w.id, "template"))} className="btn btn-ghost">
              <Save size={16} /> Як шаблон
            </button>
          )}
          <button
            disabled={navPending}
            onClick={() => window.confirm("Видалити це тренування назавжди?") && startNav(() => deleteWorkoutAction(w.id))}
            className="btn btn-danger"
          >
            <Trash2 size={16} /> Видалити
          </button>
        </div>

        <NotesField
          value={w.notes}
          placeholder="Нотатки до тренування"
          onSave={(notes) => {
            setW((cur) => ({ ...cur, notes }));
            run(() => updateWorkoutAction(w.id, { notes }));
          }}
        />
      </header>

      {/* ── Apple Watch data ── */}
      {done && (
        <WatchCard
          workout={w}
          candidates={healthCandidates}
          onLink={async (hwId, link) => {
            await run(() => linkHealthWorkoutAction(hwId, link ? w.id : null));
            await sync();
          }}
        />
      )}

      {/* ── Exercises ── */}
      {w.exercises.map((e, i) => (
        <ExerciseCard
          key={e.id}
          e={e}
          tracked={tracked}
          last={last[e.exercise.id]}
          first={i === 0}
          lastInList={i === w.exercises.length - 1}
          onMove={(d) => moveExercise(e.id, d)}
          onRemove={() => removeExercise(e.id)}
          onRest={(restSeconds) => {
            mapExercise(e.id, (x) => ({ ...x, restSeconds }));
            run(() => updateWorkoutExerciseAction(e.id, { restSeconds }));
          }}
          onNotes={(notes) => {
            mapExercise(e.id, (x) => ({ ...x, notes }));
            run(() => updateWorkoutExerciseAction(e.id, { notes }));
          }}
          onAddSet={() => addSet(e)}
          onPatchSet={(setId, patch) => patchSet(e.id, setId, patch)}
          onToggleSet={(s, idx) => toggleSet(e, s, idx)}
          onRemoveSet={(setId) => removeSet(e.id, setId)}
        />
      ))}

      <button onClick={() => setPicker(true)} className="btn btn-ghost w-full py-3">
        <Plus size={18} /> Додати вправу
      </button>

      {picker && <ExercisePicker exercises={exercises} onPick={addExercise} onClose={() => setPicker(false)} />}

      {rest && (
        <RestBar
          rest={rest}
          onAdjust={(d) => setRest((r) => (r ? { endsAt: r.endsAt + d * 1000, total: Math.max(5, r.total + d) } : r))}
          onDone={(natural) => {
            if (natural) beep(audio.current);
            setRest(null);
          }}
        />
      )}

      {confirmFinish && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setConfirmFinish(false)}>
          <div role="alertdialog" aria-modal="true" className="card w-full max-w-sm space-y-4 p-5" onClick={(ev) => ev.stopPropagation()}>
            <h2 className="text-lg font-semibold">Завершити тренування?</h2>
            <p className="text-sm text-ink-2">
              Виконано {doneSets} з {totalSets} підходів.
              {totalSets > doneSets && ` ${totalSets - doneSets} невідмічених буде прибрано із запису.`}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmFinish(false)} className="btn btn-ghost flex-1">
                Ще ні
              </button>
              <button onClick={finish} className="btn btn-primary flex-1">
                Завершити
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Pieces ─────────────────────────

function Mini({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="tabular mt-0.5 text-lg font-semibold">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  return (
    <div className="tabular font-mono text-3xl font-semibold" role="timer">
      {fmtClock((now - +new Date(since)) / 1000)}
    </div>
  );
}

function NotesField({
  value,
  placeholder,
  onSave,
}: {
  value: string | null;
  placeholder: string;
  onSave: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(Boolean(value));
  const [text, setText] = useState(value ?? "");
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    // Remote change (e.g. Claude added a note) — adopt it.
    setSeen(value);
    setText(value ?? "");
    if (value) setOpen(true);
  }
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-xs text-muted hover:text-ink">
        <StickyNote size={14} /> Додати нотатку
      </button>
    );
  }
  return (
    <textarea
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const v = text.trim() || null;
        if (v !== value) onSave(v);
        if (!v) setOpen(false);
      }}
      rows={2}
      placeholder={placeholder}
      aria-label={placeholder}
      className="field resize-y text-sm"
    />
  );
}

function ExerciseCard({
  e,
  tracked,
  last,
  first,
  lastInList,
  onMove,
  onRemove,
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
  onRest: (v: number | null) => void;
  onNotes: (v: string | null) => void;
  onAddSet: () => void;
  onPatchSet: (setId: string, patch: Partial<CSet>) => void;
  onToggleSet: (s: CSet, index: number) => void;
  onRemoveSet: (setId: string) => void;
}) {
  const t = e.exercise.tracking;
  const cols = columnsFor(t);
  let n = 0;
  return (
    <section className="card p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/exercises/${e.exercise.id}`} className="block truncate font-medium hover:underline">
            {e.exercise.name}
          </Link>
          <div className="truncate text-xs text-muted">
            {e.exercise.nameUk ? `${e.exercise.nameUk} · ` : ""}
            {MUSCLE_LABEL[e.exercise.muscle]}
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <IconBtn label="Вище" disabled={first} onClick={() => onMove(-1)}>
            <ArrowUp size={16} />
          </IconBtn>
          <IconBtn label="Нижче" disabled={lastInList} onClick={() => onMove(1)}>
            <ArrowDown size={16} />
          </IconBtn>
          <IconBtn label="Прибрати вправу" onClick={onRemove}>
            <Trash2 size={16} />
          </IconBtn>
        </div>
      </div>

      {last && last.sets.length > 0 && (
        <p className="mt-1.5 truncate text-xs text-muted">
          Минулого разу{last.date ? ` (${fmtDate(last.date)})` : ""}: {last.sets.map((s) => describeSet(t, s)).join(", ")}
        </p>
      )}

      <div className="mt-3 space-y-1.5">
        <div className={cx("grid items-center gap-2 px-1 text-[11px] text-muted", gridFor(cols.length, tracked))}>
          <span>#</span>
          {cols.map((c) => (
            <span key={c.key} className="text-center">
              {c.label}
            </span>
          ))}
          {tracked && <span className="text-center">✓</span>}
          <span />
        </div>
        {e.sets.map((s, idx) => {
          const label = s.type === "normal" ? String(++n) : SET_TYPE_SHORT[s.type];
          const prev = last?.sets[idx];
          return (
            <div
              key={s.id}
              className={cx(
                "grid items-center gap-2 rounded-lg px-1 py-1",
                gridFor(cols.length, tracked),
                s.completed && "bg-good/10",
              )}
            >
              <button
                onClick={() => onPatchSet(s.id, { type: SET_TYPE_ORDER[(SET_TYPE_ORDER.indexOf(s.type) + 1) % SET_TYPE_ORDER.length] })}
                title={`${SET_TYPE_LABEL[s.type]} — натисніть, щоб змінити тип`}
                aria-label={`Тип підходу: ${SET_TYPE_LABEL[s.type]}`}
                className={cx(
                  "tabular grid size-9 place-items-center rounded-lg text-sm font-medium",
                  s.type === "normal" ? "bg-white/5 text-ink-2" : "bg-warning/20 text-ink",
                )}
              >
                {label}
              </button>
              {cols.map((c) => (
                <NumInput
                  key={c.key}
                  label={c.label}
                  decimal={c.decimal}
                  value={c.get(s)}
                  placeholder={prev ? fmtPlaceholder(c.get(prev as CSet)) : ""}
                  onChange={(v) => onPatchSet(s.id, c.set(v))}
                />
              ))}
              {tracked && (
                <button
                  onClick={() => onToggleSet(s, idx)}
                  role="checkbox"
                  aria-checked={s.completed}
                  aria-label="Підхід виконано"
                  className={cx(
                    "grid h-10 place-items-center rounded-lg border transition-colors",
                    s.completed ? "border-good bg-good text-white" : "border-line bg-surface-2 text-muted hover:bg-white/10",
                  )}
                >
                  <Check size={18} />
                </button>
              )}
              <IconBtn label="Видалити підхід" onClick={() => onRemoveSet(s.id)}>
                <X size={16} />
              </IconBtn>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button onClick={onAddSet} className="btn btn-ghost py-1.5 text-xs">
          <Plus size={14} /> Підхід
        </button>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <Timer size={14} /> Відпочинок
          <select
            value={e.restSeconds ?? ""}
            onChange={(ev) => onRest(ev.target.value ? Number(ev.target.value) : null)}
            className="rounded-md border border-line bg-surface-2 px-1.5 py-1 text-xs text-ink"
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
    </section>
  );
}

type Col = { key: string; label: string; decimal: boolean; get: (s: CSet) => number | null; set: (v: number | null) => Partial<CSet> };

function columnsFor(t: Tracking): Col[] {
  const weight = (label: string): Col => ({ key: "w", label, decimal: true, get: (s) => s.weight, set: (v) => ({ weight: v }) });
  const reps: Col = { key: "r", label: "повт", decimal: false, get: (s) => s.reps, set: (v) => ({ reps: v }) };
  switch (t) {
    case "weight_reps":
      return [weight("кг"), reps];
    case "reps":
      return [weight("+кг"), reps];
    case "duration":
      return [{ key: "d", label: "сек", decimal: false, get: (s) => s.durationSec, set: (v) => ({ durationSec: v }) }];
    case "distance":
      return [
        {
          key: "km",
          label: "км",
          decimal: true,
          get: (s) => (s.distanceM != null ? Math.round(s.distanceM / 10) / 100 : null),
          set: (v) => ({ distanceM: v != null ? Math.round(v * 1000) : null }),
        },
        {
          key: "min",
          label: "хв",
          decimal: true,
          get: (s) => (s.durationSec != null ? Math.round(s.durationSec / 6) / 10 : null),
          set: (v) => ({ durationSec: v != null ? Math.round(v * 60) : null }),
        },
      ];
  }
}

function gridFor(cols: number, tracked: boolean) {
  if (cols === 1) return tracked ? "grid-cols-[2.25rem_1fr_3rem_2rem]" : "grid-cols-[2.25rem_1fr_2rem]";
  return tracked ? "grid-cols-[2.25rem_1fr_1fr_3rem_2rem]" : "grid-cols-[2.25rem_1fr_1fr_2rem]";
}

const fmtPlaceholder = (v: number | null) => (v == null ? "" : String(v));

function NumInput({
  value,
  onChange,
  placeholder,
  label,
  decimal,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  label: string;
  decimal: boolean;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const [seen, setSeen] = useState(value);
  const [focused, setFocused] = useState(false);
  if (seen !== value) {
    setSeen(value);
    if (!focused) setText(value == null ? "" : String(value));
  }
  return (
    <input
      value={text}
      inputMode={decimal ? "decimal" : "numeric"}
      placeholder={placeholder}
      aria-label={label}
      onFocus={(e) => {
        setFocused(true);
        e.target.select();
      }}
      onBlur={() => {
        setFocused(false);
        setText(value == null ? "" : String(value));
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(",", ".").replace(decimal ? /[^0-9.]/g : /[^0-9]/g, "");
        setText(raw);
        const n = raw === "" ? null : Number(raw);
        if (n === null || Number.isFinite(n)) onChange(n);
      }}
      className="tabular h-10 w-full min-w-0 rounded-lg border border-line bg-surface-2 px-2 text-center text-ink outline-none placeholder:text-muted/60 focus:border-accent"
    />
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/10 hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function RestBar({
  rest,
  onAdjust,
  onDone,
}: {
  rest: { endsAt: number; total: number };
  onAdjust: (deltaSec: number) => void;
  onDone: (natural: boolean) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(iv);
  }, []);
  const left = (rest.endsAt - now) / 1000;
  useEffect(() => {
    if (left <= 0) onDone(true);
  }, [left, onDone]);
  const pct = Math.min(100, Math.max(0, (left / rest.total) * 100));
  return (
    <div className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-40 px-3 md:bottom-4 md:left-56">
      <div className="mx-auto max-w-md overflow-hidden rounded-2xl border border-line bg-surface-2 shadow-xl">
        <div className="flex items-center gap-2 p-3">
          <Timer size={18} className="text-accent" />
          <div className="mr-auto">
            <div className="text-[11px] text-muted">Відпочинок</div>
            <div className="tabular font-mono text-xl font-semibold" role="timer">
              {fmtClock(Math.ceil(Math.max(0, left)))}
            </div>
          </div>
          <button onClick={() => onAdjust(-15)} className="btn btn-ghost px-3 py-1.5 text-xs">
            −15
          </button>
          <button onClick={() => onAdjust(15)} className="btn btn-ghost px-3 py-1.5 text-xs">
            +15
          </button>
          <button onClick={() => onDone(false)} className="btn btn-primary px-3 py-1.5 text-xs">
            Пропустити
          </button>
        </div>
        <div className="h-1 bg-white/5">
          <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

function WatchCard({
  workout,
  candidates,
  onLink,
}: {
  workout: CWorkout;
  candidates: HealthCandidate[];
  onLink: (healthWorkoutId: string, link: boolean) => void;
}) {
  const [pick, setPick] = useState("");
  if (workout.health.length === 0) {
    return (
      <section className="card p-4">
        <h2 className="flex items-center gap-2 text-sm font-medium text-ink-2">
          <Watch size={16} /> Apple Watch
        </h2>
        <p className="mt-2 text-sm text-muted">
          Даних з годинника для цього тренування ще немає. Вони підтягнуться автоматично після наступної синхронізації
          Apple Health, якщо час тренувань збігається.
        </p>
        {candidates.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <select value={pick} onChange={(e) => setPick(e.target.value)} className="field w-auto flex-1 text-sm" aria-label="Тренування з годинника">
              <option value="">Привʼязати вручну…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.activityType} · {fmtDate(c.startAt)} {fmtTime(c.startAt)} · {fmtDuration(c.durationSec)}
                </option>
              ))}
            </select>
            <button disabled={!pick} onClick={() => onLink(pick, true)} className="btn btn-ghost">
              Привʼязати
            </button>
          </div>
        )}
      </section>
    );
  }
  return (
    <>
      {workout.health.map((h) => {
        const start = +new Date(h.startAt);
        const points = (h.hrSamples ?? []).map((s) => {
          const min = (+new Date(s.t) - start) / 60000;
          return { label: `${Math.round(min)}′`, value: s.bpm, hint: `${fmtTime(s.t)} · ${Math.round(min)} хв` };
        });
        return (
          <section key={h.id} className="card p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-medium text-ink-2">
                <Watch size={16} /> Apple Watch · {h.activityType}
              </h2>
              <button onClick={() => onLink(h.id, false)} className="text-xs text-muted hover:text-ink">
                Відвʼязати
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <WatchStat icon={<Heart size={14} />} label="Середній пульс" value={fmtNum(h.avgHr)} unit="уд/хв" />
              <WatchStat icon={<Heart size={14} />} label="Макс. пульс" value={fmtNum(h.maxHr)} unit="уд/хв" />
              <WatchStat label="Активні калорії" value={fmtNum(h.activeKcal)} unit="ккал" />
              <WatchStat label="Час на годиннику" value={fmtDuration(h.durationSec)} />
            </div>
            {points.length > 1 && (
              <div className="mt-4">
                <div className="mb-1 text-xs text-muted">Пульс під час тренування, уд/хв</div>
                <TrendChart data={points} unit="уд/хв" height={180} />
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

function WatchStat({ icon, label, value, unit }: { icon?: React.ReactNode; label: string; value: string; unit?: string }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-xs text-muted">
        {icon}
        {label}
      </div>
      <div className="tabular text-lg font-semibold">
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-muted">{unit}</span>}
      </div>
    </div>
  );
}

const restFor = (totalSec: number) => ({ endsAt: Date.now() + totalSec * 1000, total: totalSec });

// ───────────────────────── Sound ─────────────────────────

function createAudio(): AudioContext | null {
  try {
    return new AudioContext();
  } catch {
    return null;
  }
}

function beep(ctx: AudioContext | null) {
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* not supported */
  }
  if (!ctx) return;
  for (const [i, freq] of [880, 880, 1175].entries()) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    const t = ctx.currentTime + i * 0.22;
    osc.start(t);
    osc.stop(t + 0.15);
  }
}
