"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Check,
  CloudOff,
  Copy,
  Flag,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Save,
  Smartphone,
  StickyNote,
  Timer,
  Trash2,
  Watch,
  X,
} from "lucide-react";
import type { SetType, Tracking, WorkoutStatus } from "@/db/schema";
import { deleteWorkoutAction, linkHealthWorkoutAction } from "@/lib/actions";
import { cloneWorkout, hardNavigate, pushWorkout, readLocal, removeLocal, writeLocal } from "@/lib/client/offline";
import { cx, EXERCISES_FORMS, fmtClock, fmtDate, fmtDateLong, fmtDuration, fmtNum, fmtTime, plural } from "@/lib/format";
import { MUSCLE_LABEL, SET_TYPE_LABEL, SET_TYPE_SHORT, STATUS_LABEL } from "@/lib/labels";
import { describeSet, type CExercise, type CExerciseInfo, type CLast, type CSet, type CWorkout } from "@/lib/shape";
import { HrChart } from "../hr-chart";
import { ExercisePicker } from "./exercise-picker";

const DEFAULT_REST = 90;
const REST_OPTIONS = [30, 45, 60, 90, 120, 150, 180, 240, 300];
const SET_TYPE_ORDER: SetType[] = ["normal", "warmup", "drop", "failure"];

export type HealthCandidate = { id: string; activityType: string; startAt: string; durationSec: number | null; avgHr: number | null };
type SaveState = "saved" | "dirty" | "saving" | "local" | "error" | "auth";
type Picker = { mode: "add" } | { mode: "replace"; weId: string } | null;

export function WorkoutEditor({
  initial,
  last,
  exercises,
  healthCandidates = [],
  localOnly = false,
}: {
  initial: CWorkout;
  last: CLast;
  exercises: CExerciseInfo[];
  healthCandidates?: HealthCandidate[];
  /** Rendered from device storage (offline screen) — server-only actions are hidden. */
  localOnly?: boolean;
}) {
  const router = useRouter();
  const [w, setW] = useState(initial);
  const wRef = useRef(initial);
  const [save, setSave] = useState<SaveState>("saved");
  const saveRef = useRef<SaveState>("saved");
  const [picker, setPicker] = useState<Picker>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [rest, setRest] = useState<{ endsAt: number; total: number } | null>(null);
  const [busy, startNav] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const id = initial.id;

  const live = w.status === "in_progress";
  const done = w.status === "completed";
  const tracked = live || done; // sets carry a "done" tick

  const setSaveState = useCallback((s: SaveState) => {
    saveRef.current = s;
    setSave(s);
  }, []);

  const adopt = useCallback((next: CWorkout) => {
    wRef.current = next;
    setW(next);
  }, []);

  // ── Saving: device first, then the server ──
  const saveFn = useRef<() => void>(() => undefined);
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => saveFn.current(), 1500);
  }, []);

  const saveNow = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setSaveState("saving");
    const r = await pushWorkout(id);
    const stillDirty = readLocal(id)?.dirty ?? false;
    if (r.status === "ok" || r.status === "clean") {
      if (r.workout && !stillDirty) adopt(r.workout);
      setSaveState(stillDirty ? "dirty" : "saved");
      if (stillDirty) schedule(); // edited again while the upload was in flight
    } else {
      setSaveState(r.status === "offline" ? "local" : r.status);
    }
    return r;
  }, [id, adopt, setSaveState, schedule]);

  useEffect(() => {
    saveFn.current = () => void saveNow();
  }, [saveNow]);

  /** Applies an edit: screen → device storage → (debounced) server. */
  const persist = useCallback(
    (next: CWorkout, removed: { sets?: string[]; exercises?: string[] } = {}) => {
      adopt(next);
      const prev = readLocal(id);
      writeLocal(id, {
        workout: next,
        dirty: true,
        deletedSetIds: [...(prev?.deletedSetIds ?? []), ...(removed.sets ?? [])],
        deletedExerciseIds: [...(prev?.deletedExerciseIds ?? []), ...(removed.exercises ?? [])],
        rev: (prev?.rev ?? 0) + 1,
      });
      setSaveState("dirty");
      schedule();
    },
    [id, adopt, schedule, setSaveState],
  );

  // On open: unsaved changes on this device win over what the server sent.
  useEffect(() => {
    const local = readLocal(id);
    if (local?.dirty) {
      // Device storage is an external store: adopt it once hydration is done.
      void Promise.resolve().then(() => {
        adopt(local.workout);
        void saveNow();
      });
    } else {
      writeLocal(id, { workout: wRef.current, dirty: false, deletedExerciseIds: [], deletedSetIds: [], rev: local?.rev ?? 0 });
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [id, adopt, saveNow]);

  const refetch = useCallback(async () => {
    if (saveRef.current !== "saved") return;
    try {
      const r = await fetch(`/api/workouts/${id}`, { cache: "no-store" });
      if (!r.ok) return;
      const fresh = (await r.json()) as CWorkout;
      if (saveRef.current !== "saved") return;
      adopt(fresh);
      writeLocal(id, { workout: fresh, dirty: false, deletedExerciseIds: [], deletedSetIds: [], rev: readLocal(id)?.rev ?? 0 });
    } catch {
      /* offline — keep what we have */
    }
  }, [id, adopt]);

  // Pull changes made elsewhere (e.g. Claude editing the plan mid-workout); retry stuck saves.
  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      if (saveRef.current === "saved") void refetch();
      else if (saveRef.current === "local" || saveRef.current === "error") void saveNow();
    };
    const iv = setInterval(tick, 15000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("online", tick);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("online", tick);
    };
  }, [refetch, saveNow]);

  // ── Edits ──
  const cur = () => wRef.current;
  const mapExercise = (weId: string, fn: (e: CExercise) => CExercise) => ({
    ...cur(),
    exercises: cur().exercises.map((e) => (e.id === weId ? fn(e) : e)),
  });
  const patchSet = (weId: string, setId: string, patch: Partial<CSet>) =>
    persist(mapExercise(weId, (e) => ({ ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) })));

  const pickExercise = (info: CExerciseInfo) => {
    const target = picker;
    setPicker(null);
    if (target?.mode === "replace") {
      persist(mapExercise(target.weId, (e) => ({ ...e, exercise: info })));
      return;
    }
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
        completedAt: null,
      })),
    };
    persist({ ...cur(), exercises: [...cur().exercises, item] });
  };

  const removeExercise = (weId: string) => {
    if (!window.confirm("Прибрати вправу з тренування?")) return;
    persist({ ...cur(), exercises: cur().exercises.filter((e) => e.id !== weId) }, { exercises: [weId] });
  };

  const moveExercise = (weId: string, dir: -1 | 1) => {
    const list = [...cur().exercises];
    const i = list.findIndex((e) => e.id === weId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    persist({ ...cur(), exercises: list });
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
      // When fixing up a finished workout, a new set is something that was done.
      completed: cur().status === "completed",
      completedAt: null,
    };
    persist(mapExercise(e.id, (x) => ({ ...x, sets: [...x.sets, s] })));
  };

  const toggleSet = (e: CExercise, s: CSet, index: number) => {
    const completed = !s.completed;
    const patch: Partial<CSet> = { completed, completedAt: completed ? new Date().toISOString() : null };
    if (completed) {
      // Fill blanks from the previous session so one tap is enough to log the set.
      const p = last[e.exercise.id]?.sets[index];
      if (p) {
        if (s.weight == null && p.weight != null) patch.weight = p.weight;
        if (s.reps == null && p.reps != null) patch.reps = p.reps;
        if (s.durationSec == null && p.durationSec != null) patch.durationSec = p.durationSec;
        if (s.distanceM == null && p.distanceM != null) patch.distanceM = p.distanceM;
      }
    }
    patchSet(e.id, s.id, patch);
    if (cur().status === "in_progress" && completed) {
      audio.current ??= createAudio();
      setRest(restFor(e.restSeconds ?? DEFAULT_REST));
    }
  };

  // ── Lifecycle ──
  const open = (workoutId: string, synced: boolean) => {
    if (synced && !localOnly) router.push(`/workouts/${workoutId}`);
    else hardNavigate(`/train#${workoutId}`);
  };

  const spawn = (status: WorkoutStatus) =>
    startNav(async () => {
      const copy = cloneWorkout(cur(), status);
      writeLocal(copy.id, { workout: copy, dirty: true, deletedExerciseIds: [], deletedSetIds: [], rev: 1 });
      const r = await pushWorkout(copy.id);
      open(copy.id, r.status === "ok");
    });

  const start = () => {
    if (cur().status === "template") return spawn("in_progress");
    persist({ ...cur(), status: "in_progress", startedAt: new Date().toISOString(), endedAt: null });
    void saveNow();
  };

  const finish = () => {
    setConfirmFinish(false);
    setRest(null);
    const removedSets: string[] = [];
    const removedExercises: string[] = [];
    const kept = cur()
      .exercises.map((e) => {
        e.sets.filter((s) => !s.completed).forEach((s) => removedSets.push(s.id));
        return { ...e, sets: e.sets.filter((s) => s.completed) };
      })
      .filter((e) => {
        if (e.sets.length === 0) removedExercises.push(e.id);
        return e.sets.length > 0;
      });
    persist(
      { ...cur(), status: "completed", endedAt: new Date().toISOString(), exercises: kept },
      { sets: removedSets, exercises: removedExercises },
    );
    void saveNow();
  };

  const resume = () => {
    persist({ ...cur(), status: "in_progress", endedAt: null });
    void saveNow();
  };

  const remove = () => {
    if (!window.confirm("Видалити це тренування назавжди?")) return;
    if (timer.current) clearTimeout(timer.current);
    if (localOnly) {
      removeLocal(id);
      hardNavigate("/train");
      return;
    }
    startNav(async () => {
      try {
        await deleteWorkoutAction(id);
        removeLocal(id);
      } catch (e) {
        // A redirect is how the action reports success; anything else is a lost connection.
        if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
          removeLocal(id);
          throw e;
        }
        window.alert("Немає звʼязку із сервером — видалити зараз не вдалося.");
      }
    });
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
        <div className="flex items-center gap-2">
          <Link href={localOnly ? "/train" : "/workouts"} className="text-sm whitespace-nowrap text-accent">
            ← {localOnly ? "Список" : "Тренування"}
          </Link>
          <StatusChip status={w.status} />
          <SaveButton state={save} onSave={() => void saveNow()} />
        </div>
        <input
          value={w.name}
          onChange={(e) => persist({ ...cur(), name: e.target.value })}
          aria-label="Назва тренування"
          className="w-full bg-transparent text-[1.75rem] leading-tight font-bold tracking-tight outline-none placeholder:text-muted"
          placeholder="Назва тренування"
        />

        {live && w.startedAt && (
          <div className="card p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="caps">Час тренування</div>
                <Elapsed since={w.startedAt} />
                <div className="mt-1 text-xs text-muted">почато о {fmtTime(w.startedAt)}</div>
              </div>
              <div className="text-right">
                <div className="caps">Підходи</div>
                <div className="num text-3xl font-semibold">
                  {doneSets}
                  <span className="text-muted">/{totalSets}</span>
                </div>
              </div>
            </div>
            <button onClick={() => setConfirmFinish(true)} className="btn btn-primary mt-4 w-full">
              <Flag size={18} /> Завершити тренування
            </button>
          </div>
        )}

        {done && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini
              label="Дата"
              value={fmtDate(w.startedAt, { day: "numeric", month: "short" })}
              hint={`${fmtDate(w.startedAt, { weekday: "short", year: "numeric" })} · ${fmtTime(w.startedAt)}–${fmtTime(w.endedAt)}`}
            />
            <Mini
              label="Тривалість"
              tone="text-activity"
              value={w.startedAt && w.endedAt ? fmtDuration((+new Date(w.endedAt) - +new Date(w.startedAt)) / 1000) : "—"}
            />
            <Mini label="Підходи" tone="text-strength" value={String(doneSets)} hint={plural(w.exercises.length, EXERCISES_FORMS)} />
            <Mini label="Тоннаж" tone="text-strength" value={fmtNum(volume)} unit="кг" />
          </div>
        )}

        {w.status === "planned" && (
          <label className="card flex items-center justify-between gap-3 px-4 py-3 text-[15px]">
            <span>
              Дата
              {w.scheduledFor && <span className="ml-2 text-sm text-muted">{fmtDateLong(w.scheduledFor)}</span>}
            </span>
            <input
              type="date"
              value={w.scheduledFor ?? ""}
              onChange={(e) => persist({ ...cur(), scheduledFor: e.target.value || null })}
              className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-ink outline-none"
            />
          </label>
        )}

        <div className="flex flex-wrap gap-2">
          {(w.status === "planned" || w.status === "template") && (
            <button disabled={busy} onClick={start} className="btn btn-primary">
              <Play size={18} /> Почати тренування
            </button>
          )}
          {done && (
            <>
              <button disabled={busy} onClick={() => spawn("in_progress")} className="btn btn-primary">
                <RotateCcw size={18} /> Повторити зараз
              </button>
              <button disabled={busy} onClick={() => spawn("planned")} className="btn btn-ghost">
                <Copy size={16} /> Запланувати копію
              </button>
              <button onClick={resume} className="btn btn-ghost">
                <Play size={16} /> Продовжити
              </button>
            </>
          )}
          {w.status !== "template" && (
            <button disabled={busy} onClick={() => spawn("template")} className="btn btn-ghost">
              <Save size={16} /> Як шаблон
            </button>
          )}
          <button disabled={busy} onClick={remove} className="btn btn-danger">
            <Trash2 size={16} /> Видалити
          </button>
        </div>

        <NotesField value={w.notes} placeholder="Нотатки до тренування" onSave={(notes) => persist({ ...cur(), notes })} />
      </header>

      {/* ── Apple Watch ── */}
      {done && !localOnly && (
        <WatchCard
          workout={w}
          candidates={healthCandidates}
          onLink={async (hwId, link) => {
            await linkHealthWorkoutAction(hwId, link ? id : null);
            await refetch();
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
          onReplace={() => setPicker({ mode: "replace", weId: e.id })}
          onRest={(restSeconds) => persist(mapExercise(e.id, (x) => ({ ...x, restSeconds })))}
          onNotes={(notes) => persist(mapExercise(e.id, (x) => ({ ...x, notes })))}
          onAddSet={() => addSet(e)}
          onPatchSet={(setId, patch) => patchSet(e.id, setId, patch)}
          onToggleSet={(s, idx) => toggleSet(e, s, idx)}
          onRemoveSet={(setId) =>
            persist(mapExercise(e.id, (x) => ({ ...x, sets: x.sets.filter((s) => s.id !== setId) })), { sets: [setId] })
          }
        />
      ))}

      <button onClick={() => setPicker({ mode: "add" })} className="btn btn-ghost w-full">
        <Plus size={18} /> Додати вправу
      </button>

      {picker && (
        <ExercisePicker
          title={picker.mode === "replace" ? "Замінити вправу" : "Додати вправу"}
          exercises={exercises}
          onPick={pickExercise}
          onClose={() => setPicker(null)}
        />
      )}

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
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setConfirmFinish(false)}>
          <div role="alertdialog" aria-modal="true" className="card w-full max-w-sm space-y-4 p-5" onClick={(ev) => ev.stopPropagation()}>
            <h2 className="text-xl font-bold">Завершити тренування?</h2>
            <p className="text-[15px] text-ink-2">
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

function StatusChip({ status }: { status: WorkoutStatus }) {
  return (
    <span
      className={cx(
        "rounded-full px-2.5 py-0.5 text-xs font-medium",
        status === "in_progress" ? "bg-accent/20 text-accent" : "bg-surface-2 text-ink-2",
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function SaveButton({ state, onSave }: { state: SaveState; onSave: () => void }) {
  if (state === "auth") {
    return (
      <Link href="/login" className="btn btn-sm btn-danger ml-auto">
        Увійдіть знову
      </Link>
    );
  }
  const view = {
    saved: { icon: <Check size={15} />, label: "Збережено", cls: "btn-ghost text-ink-2" },
    dirty: { icon: <Save size={15} />, label: "Зберегти", cls: "btn-primary" },
    saving: { icon: <Loader2 size={15} className="animate-spin" />, label: "Збереження…", cls: "btn-ghost" },
    local: { icon: <Smartphone size={15} />, label: "На пристрої", cls: "bg-warning/15 text-warning" },
    error: { icon: <CloudOff size={15} />, label: "Помилка · повторити", cls: "btn-danger" },
  }[state];
  return (
    <button
      onClick={onSave}
      disabled={state === "saving"}
      aria-live="polite"
      title={
        state === "local"
          ? "Немає звʼязку: зміни збережені на цьому пристрої й надішлються на сервер автоматично"
          : state === "saved"
            ? "Усі зміни на сервері"
            : undefined
      }
      className={cx("btn btn-sm ml-auto", view.cls)}
    >
      {view.icon}
      {view.label}
    </button>
  );
}

function Mini({ label, value, unit, hint, tone }: { label: string; value: string; unit?: string; hint?: string; tone?: string }) {
  return (
    <div className="card p-3.5">
      <div className="caps">{label}</div>
      <div className={cx("num mt-0.5 text-2xl font-semibold", tone)}>
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-muted">{unit}</span>}
      </div>
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
    <div className="num text-5xl leading-none font-semibold text-accent" role="timer">
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
    // Changed elsewhere (e.g. Claude added a note) — adopt it.
    setSeen(value);
    setText(value ?? "");
    if (value) setOpen(true);
  }
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <StickyNote size={15} /> Додати нотатку
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
      className="field resize-y text-[15px]"
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
  const t = e.exercise.tracking;
  const cols = columnsFor(t);
  let n = 0;
  return (
    <section className="card p-3.5 sm:p-4">
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 pt-1">
          <Link href={`/exercises/${e.exercise.id}`} className="block truncate text-[17px] font-semibold hover:underline">
            {e.exercise.name}
          </Link>
          <div className="truncate text-xs text-muted">
            {e.exercise.nameUk ? `${e.exercise.nameUk} · ` : ""}
            {MUSCLE_LABEL[e.exercise.muscle]}
          </div>
        </div>
        <div className="-mr-1.5 flex shrink-0 items-center">
          <IconBtn label="Замінити вправу" onClick={onReplace}>
            <ArrowLeftRight size={17} />
          </IconBtn>
          <IconBtn label="Вище" disabled={first} onClick={() => onMove(-1)}>
            <ArrowUp size={17} />
          </IconBtn>
          <IconBtn label="Нижче" disabled={lastInList} onClick={() => onMove(1)}>
            <ArrowDown size={17} />
          </IconBtn>
          <IconBtn label="Прибрати вправу" onClick={onRemove}>
            <Trash2 size={17} />
          </IconBtn>
        </div>
      </div>

      {last && last.sets.length > 0 && (
        <p className="mt-1 truncate text-xs text-muted">
          Минулого разу{last.date ? ` (${fmtDate(last.date)})` : ""}: {last.sets.map((s) => describeSet(t, s)).join(", ")}
        </p>
      )}

      <div className="mt-3 space-y-1.5">
        <div className={cx("caps grid items-center gap-2 px-0.5", gridFor(cols.length, tracked))}>
          <span className="text-center">#</span>
          {cols.map((c) => (
            <span key={c.key} className="text-center">
              {c.label}
            </span>
          ))}
          {tracked && <span />}
          <span />
        </div>
        {e.sets.map((s, idx) => {
          const label = s.type === "normal" ? String(++n) : SET_TYPE_SHORT[s.type];
          const prev = last?.sets[idx];
          return (
            <div key={s.id} className={cx("grid items-center gap-2", gridFor(cols.length, tracked))}>
              <button
                onClick={() => onPatchSet(s.id, { type: SET_TYPE_ORDER[(SET_TYPE_ORDER.indexOf(s.type) + 1) % SET_TYPE_ORDER.length] })}
                title={`${SET_TYPE_LABEL[s.type]} — натисніть, щоб змінити тип`}
                aria-label={`Тип підходу: ${SET_TYPE_LABEL[s.type]}`}
                className={cx(
                  "num grid size-9 place-items-center rounded-full text-sm font-semibold",
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
                    "grid size-11 place-items-center rounded-full transition active:scale-90",
                    s.completed ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted hover:bg-surface-3",
                  )}
                >
                  <Check size={20} strokeWidth={3} />
                </button>
              )}
              <button
                onClick={() => onRemoveSet(s.id)}
                aria-label="Видалити підхід"
                className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button onClick={onAddSet} className="btn btn-sm btn-ghost">
          <Plus size={15} /> Підхід
        </button>
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
  if (cols === 1) return tracked ? "grid-cols-[2.25rem_1fr_2.75rem_2rem]" : "grid-cols-[2.25rem_1fr_2rem]";
  return tracked ? "grid-cols-[2.25rem_1fr_1fr_2.75rem_2rem]" : "grid-cols-[2.25rem_1fr_1fr_2rem]";
}

const fmtPlaceholder = (v: number | null) => (v == null ? "" : String(v));

function NumInput({
  value,
  onChange,
  placeholder,
  label,
  decimal,
  done,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  label: string;
  decimal: boolean;
  done: boolean;
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
      className={cx(
        "num h-11 w-full min-w-0 rounded-xl border border-transparent px-2 text-center text-lg font-medium text-ink outline-none placeholder:text-muted/60 focus:border-accent",
        done ? "bg-accent/15" : "bg-surface-2",
      )}
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
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label} className="icon-btn size-9">
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
    <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 px-3 md:bottom-5 md:left-60">
      <div className="mx-auto max-w-md overflow-hidden rounded-3xl bg-surface-2 shadow-2xl ring-1 ring-white/10">
        <div className="flex items-center gap-2 p-3 pl-4">
          <div className="mr-auto">
            <div className="caps">Відпочинок</div>
            <div className="num text-3xl leading-none font-semibold text-accent" role="timer">
              {fmtClock(Math.ceil(Math.max(0, left)))}
            </div>
          </div>
          <button onClick={() => onAdjust(-15)} className="btn btn-sm bg-surface-3 text-ink">
            −15
          </button>
          <button onClick={() => onAdjust(15)} className="btn btn-sm bg-surface-3 text-ink">
            +15
          </button>
          <button onClick={() => onDone(false)} className="btn btn-sm btn-primary">
            Далі
          </button>
        </div>
        <div className="h-1 bg-surface-3">
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
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <Watch size={17} className="text-heart" /> Apple Watch
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
      {workout.health.map((h) => (
        <section key={h.id} className="card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex min-w-0 items-center gap-2 text-[15px] font-semibold">
              <Watch size={17} className="shrink-0 text-heart" />
              <span className="truncate">{h.activityType}</span>
            </h2>
            <button onClick={() => onLink(h.id, false)} className="shrink-0 text-xs text-muted hover:text-ink">
              Відвʼязати
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4">
            <WatchStat label="Середній пульс" value={fmtNum(h.avgHr)} unit="уд/хв" tone="text-heart" />
            <WatchStat label="Макс. пульс" value={fmtNum(h.maxHr)} unit="уд/хв" tone="text-heart" />
            <WatchStat label="Активні калорії" value={fmtNum(h.activeKcal)} unit="ккал" tone="text-activity" />
            <WatchStat label="Час на годиннику" value={fmtDuration(h.durationSec)} />
          </div>
          {h.hrSamples && h.hrSamples.length > 1 && (
            <div className="mt-4">
              <div className="caps mb-1">Пульс, уд/хв</div>
              <HrChart samples={h.hrSamples} start={h.startAt} end={h.endAt} />
            </div>
          )}
        </section>
      ))}
    </>
  );
}

function WatchStat({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: string }) {
  return (
    <div>
      <div className="caps">{label}</div>
      <div className={cx("num text-2xl font-semibold", tone)}>
        {value}
        {unit && <span className="ml-1 text-xs font-medium text-muted">{unit}</span>}
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
