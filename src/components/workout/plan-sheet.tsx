"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { FilePlus2, Loader2, Plus, X } from "lucide-react";
import { planFromAction, planSourcesAction, type PlanSources } from "@/lib/actions";
import { useLockScroll } from "@/lib/client/lock-scroll";
import { hardNavigate, newWorkout, pushWorkout, writeLocal } from "@/lib/client/offline";
import { addDays, cx, dayOf, EXERCISES_FORMS, fmtDate, plural } from "@/lib/format";
import { workoutKind } from "@/lib/workout-kind";
import { BodyIcon } from "./body-icon";

type Source = PlanSources["templates"][number];

/**
 * "Запланувати": pick a day, then a workout to put on it — one of the templates, a session
 * of a programme, or something done recently. An empty one can still be started from scratch.
 */
export function PlanSheet({ day: initialDay, onClose }: { day?: string; onClose: () => void }) {
  const router = useRouter();
  const [today] = useState(() => dayOf());
  const [day, setDay] = useState(initialDay ?? today);
  const [sources, setSources] = useState<PlanSources | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useLockScroll();
  useEffect(() => {
    let alive = true;
    planSourcesAction().then(
      (s) => alive && setSources(s),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, []);

  const plan = (source: Source) => {
    setBusy(source.id);
    start(async () => {
      try {
        await planFromAction(source.id, day);
        router.refresh();
        onClose();
      } catch {
        setFailed(true);
        setBusy(null);
      }
    });
  };
  const empty = () => {
    setBusy("empty");
    start(async () => {
      const w = { ...newWorkout("planned"), scheduledFor: day };
      writeLocal(w.id, { workout: w, dirty: true, deletedExerciseIds: [], deletedSetIds: [], rev: 1 });
      const r = await pushWorkout(w.id);
      if (r.status === "ok") router.push(`/workouts/${w.id}`);
      else hardNavigate(`/train#${w.id}`);
    });
  };

  const row = (s: Source) => (
    <li key={s.id}>
      <button disabled={pending} onClick={() => plan(s)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-surface-2 disabled:opacity-50">
        <BodyIcon kind={workoutKind(s.muscles)} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{s.name}</span>
          <span className="block text-xs text-muted">{plural(s.exercises, EXERCISES_FORMS)}</span>
        </span>
        {busy === s.id ? <Loader2 size={18} className="animate-spin text-muted" /> : <Plus size={18} className="text-accent" />}
      </button>
    </li>
  );
  const section = (title: string, items: Source[]) =>
    items.length > 0 && (
      <section key={title}>
        <h3 className="caps mb-1 px-2">{title}</h3>
        <ul>{items.map(row)}</ul>
      </section>
    );
  const nothing = sources && sources.templates.length + sources.programs.length + sources.recent.length === 0;
  const quick = [
    { label: "Сьогодні", value: today },
    { label: "Завтра", value: addDays(today, 1) },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overscroll-contain bg-black/70 md:items-center md:p-6" onClick={() => !pending && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Запланувати тренування"
        className="flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-[28px] bg-surface pb-[calc(1rem+env(safe-area-inset-bottom))] md:rounded-[28px] md:pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-3 p-5 pb-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-bold">Запланувати</h2>
            <button onClick={onClose} disabled={pending} aria-label="Закрити" className="icon-btn bg-surface-2">
              <X size={20} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={day} min={today} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="День" className="field min-w-0 flex-1" />
            {quick.map((q) => (
              <button
                key={q.value}
                onClick={() => setDay(q.value)}
                aria-pressed={day === q.value}
                className={cx("shrink-0 rounded-full px-3 py-2 text-sm font-medium", day === q.value ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2")}
              >
                {q.label}
              </button>
            ))}
          </div>
          <p className="text-sm text-ink-2 first-letter:uppercase">
            {fmtDate(day, { weekday: "long", day: "numeric", month: "long" })} — виберіть, що робити
          </p>
        </div>
        <div className="min-h-0 flex-1 touch-pan-y space-y-4 overflow-y-auto overscroll-contain px-3">
          {!sources && !failed && (
            <div className="grid place-items-center py-10 text-muted">
              <Loader2 className="animate-spin" />
            </div>
          )}
          {failed && <p className="px-2 py-4 text-sm text-critical">Не вдалося. Перевірте звʼязок і спробуйте ще раз.</p>}
          {sources && (
            <>
              {section("Шаблони", sources.templates)}
              {sources.programs.map((p) => section(`Програма «${p.name}»`, p.workouts))}
              {section("Нещодавні", sources.recent)}
              {nothing && <p className="px-2 py-2 text-sm text-ink-2">Шаблонів і програм ще немає. Збережіть тренування як шаблон або складіть програму — і вони зʼявляться тут.</p>}
            </>
          )}
        </div>
        <div className="px-5 pt-3">
          <button disabled={pending} onClick={empty} className="btn btn-ghost w-full">
            {busy === "empty" ? <Loader2 size={17} className="animate-spin" /> : <FilePlus2 size={17} />} Порожнє тренування на цей день
          </button>
        </div>
      </div>
    </div>
  );
}
