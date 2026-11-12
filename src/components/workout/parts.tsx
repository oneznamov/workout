"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, CirclePlay, StickyNote, X } from "lucide-react";
import type { MuscleGroup, Tracking } from "@/db/schema";
import { exerciseFrames } from "@/lib/exercise-media";
import { PushBell } from "@/components/push-toggle";
import { useLockScroll } from "@/lib/client/lock-scroll";
import { cx, fmtClock } from "@/lib/format";
import type { CSet } from "@/lib/shape";
import { workoutKind } from "@/lib/workout-kind";
import { BodyIcon } from "./body-icon";

// ───────────────────────── Set fields ─────────────────────────

export type Col = {
  key: string;
  label: string;
  decimal: boolean;
  /** how much one tap on −/+ changes the value */
  step: number;
  get: (s: CSet) => number | null;
  set: (v: number | null) => Partial<CSet>;
};

export function columnsFor(t: Tracking): Col[] {
  const weight = (label: string): Col => ({ key: "w", label, decimal: true, step: 2.5, get: (s) => s.weight, set: (v) => ({ weight: v }) });
  const reps: Col = { key: "r", label: "повт", decimal: false, step: 1, get: (s) => s.reps, set: (v) => ({ reps: v }) };
  switch (t) {
    case "weight_reps":
      return [weight("кг"), reps];
    case "reps":
      return [weight("+кг"), reps];
    case "duration":
      return [{ key: "d", label: "сек", decimal: false, step: 5, get: (s) => s.durationSec, set: (v) => ({ durationSec: v }) }];
    case "distance":
      return [
        {
          key: "km",
          label: "км",
          decimal: true,
          step: 0.1,
          get: (s) => (s.distanceM != null ? Math.round(s.distanceM / 10) / 100 : null),
          set: (v) => ({ distanceM: v != null ? Math.round(v * 1000) : null }),
        },
        {
          key: "min",
          label: "хв",
          decimal: true,
          step: 1,
          get: (s) => (s.durationSec != null ? Math.round(s.durationSec / 6) / 10 : null),
          set: (v) => ({ durationSec: v != null ? Math.round(v * 60) : null }),
        },
      ];
  }
}

export function NumInput({
  value,
  onChange,
  placeholder,
  label,
  decimal,
  done,
  size = "md",
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  label: string;
  decimal: boolean;
  done?: boolean;
  /** "hero" fills the one-set-at-a-time screen */
  size?: "md" | "xl" | "hero";
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
        "num w-full min-w-0 border border-transparent text-center font-semibold text-ink outline-none placeholder:text-muted/60 focus:border-accent",
        size === "hero"
          ? "h-[min(27vw,7.75rem)] rounded-2xl bg-transparent text-[min(24vw,7rem)] leading-none tracking-tight"
          : size === "xl"
            ? "h-16 rounded-2xl bg-transparent text-[2.5rem]"
            : "h-12 rounded-xl text-xl",
        size === "md" && (done ? "bg-accent/15" : "bg-surface-2"),
      )}
    />
  );
}

// ───────────────────────── Action sheet ─────────────────────────

export type SheetAction = {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: "danger";
  disabled?: boolean;
  /** shows a tick — for "pick one" lists such as the set type */
  checked?: boolean;
};

/** A menu that slides up from the bottom on a phone — keeps rarely used actions off the screen. */
export function ActionSheet({ title, actions, onClose }: { title?: string; actions: SheetAction[]; onClose: () => void }) {
  useLockScroll();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overscroll-contain bg-black/70 md:items-center" onClick={onClose}>
      <div
        role="menu"
        aria-label={title ?? "Дії"}
        className="pb-safe w-full max-w-md rounded-t-[28px] bg-surface p-2 md:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <span className="truncate text-[15px] font-semibold text-ink-2">{title}</span>
          <button onClick={onClose} aria-label="Закрити" className="icon-btn size-9 bg-surface-2">
            <X size={18} />
          </button>
        </div>
        <ul className="pb-2">
          {actions.map((a) => (
            <li key={a.label}>
              <button
                role="menuitem"
                disabled={a.disabled}
                onClick={() => {
                  onClose();
                  a.onSelect();
                }}
                className={cx(
                  "flex h-13 w-full items-center gap-3 rounded-2xl px-3 text-left text-[17px] font-medium hover:bg-surface-2 disabled:opacity-35",
                  a.tone === "danger" ? "text-critical" : "text-ink",
                )}
              >
                <span className="grid size-6 place-items-center">{a.icon}</span>
                <span className="flex-1">{a.label}</span>
                {a.checked && <Check size={18} strokeWidth={3} className="text-accent" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ───────────────────────── Rest ring ─────────────────────────

/**
 * Rest between sets, as large as the screen allows: the time left in huge digits that can be
 * read from the floor, a bar draining under them, the screen filling up as the rest runs out,
 * what comes next, and three big buttons.
 */
export function RestScreen({
  rest,
  onAdjust,
  onDone,
  onTick,
  children,
}: {
  rest: { endsAt: number; total: number };
  onAdjust: (deltaSec: number) => void;
  onDone: (natural: boolean) => void;
  /** called once on each of the last three seconds */
  onTick?: () => void;
  children?: ReactNode;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(iv);
  }, []);
  const left = (rest.endsAt - now) / 1000;
  useEffect(() => {
    if (left <= 0) onDone(true);
  }, [left, onDone]);
  useLockScroll();
  const secondsLeft = Math.ceil(left);
  useEffect(() => {
    if (secondsLeft >= 1 && secondsLeft <= 3) onTick?.();
    // Only the second changing matters here — not a new callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);
  const p = Math.min(1, Math.max(0, left / rest.total));
  const ending = left <= 5;
  return (
    <div role="dialog" aria-label="Відпочинок" className="fixed inset-0 z-40 flex touch-none flex-col overflow-hidden overscroll-none bg-plane md:left-60">
      <div
        aria-hidden="true"
        className={cx("absolute inset-x-0 bottom-0 transition-[height] duration-150 ease-linear", ending ? "bg-warning/20" : "bg-accent/[0.14]")}
        style={{ height: `${(1 - p) * 100}%` }}
      />
      <div className="relative mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col px-5 pt-[calc(env(safe-area-inset-top)+2rem)] pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex items-baseline gap-2">
            <span className="text-[1.6rem] leading-none font-bold">Відпочинок</span>
            <span className="num text-sm text-muted">з {fmtClock(rest.total)}</span>
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
          <div
            role="timer"
            aria-live="off"
            className={cx("num text-[min(34vw,13rem)] leading-none font-semibold tracking-tight", ending ? "animate-pulse text-warning" : "text-ink")}
          >
            {fmtClock(Math.ceil(Math.max(0, left)))}
          </div>
          <div className="mt-7 h-3 w-full overflow-hidden rounded-full bg-surface-2">
            <div className={cx("h-full rounded-full", ending ? "bg-warning" : "bg-accent")} style={{ width: `${p * 100}%` }} />
          </div>
          <div className="mt-5 flex min-h-8 touch-auto justify-center">
            <PushBell />
          </div>
        </div>
        {children}
        <div className="mt-4 grid grid-cols-[1fr_1fr_1.5fr] gap-2">
          <button onClick={() => onAdjust(-15)} disabled={left < 35} className="btn btn-ghost h-14 px-2 text-base">
            −15 с
          </button>
          <button onClick={() => onAdjust(15)} className="btn btn-ghost h-14 px-2 text-base">
            +15 с
          </button>
          <button onClick={() => onDone(false)} className="btn btn-primary h-14 px-2 text-[17px]">
            Далі
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Exercise animation ─────────────────────────

/**
 * A calm pictogram instead of a photo: a small body with the exercise's main muscle lit.
 * Tapping it (or the exercise name, see ExerciseName) opens the "how to do it" animation.
 */
export function ExerciseThumb({ name, muscle, size = 48 }: { name: string; muscle: MuscleGroup; size?: number }) {
  const frames = exerciseFrames(name);
  const [open, setOpen] = useState(false);
  const icon = <BodyIcon kind={workoutKind({ [muscle]: 1 })} size={size} />;
  if (!frames) return icon;
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={`Показати, як виконувати: ${name}`} className="shrink-0 rounded-2xl transition active:scale-95">
        {icon}
      </button>
      {open && <ExerciseAnimation name={name} frames={frames} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * The exercise name. When there is a demonstration for it, tapping the name shows how the
 * exercise is done (with a way on to its history); otherwise the name leads to the exercise page.
 */
export function ExerciseName({ name, exerciseId, className }: { name: string; exerciseId: string; className?: string }) {
  const frames = exerciseFrames(name);
  const [open, setOpen] = useState(false);
  if (!frames) {
    return (
      <Link href={`/exercises/${exerciseId}`} className={cx("hover:underline", className)}>
        {name}
      </Link>
    );
  }
  return (
    <>
      <button onClick={() => setOpen(true)} title="Як виконувати" className={cx("text-left decoration-muted/60 underline-offset-4 hover:underline", className)}>
        {name}
        <CirclePlay size={15} className="mb-0.5 ml-1.5 inline text-muted" aria-label="показати, як виконувати" />
      </button>
      {open && <ExerciseAnimation name={name} frames={frames} exerciseId={exerciseId} onClose={() => setOpen(false)} />}
    </>
  );
}

function ExerciseAnimation({ name, frames, exerciseId, onClose }: { name: string; frames: [string, string]; exerciseId?: string; onClose: () => void }) {
  useLockScroll();
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => setFrame((f) => 1 - f), 900);
    return () => clearInterval(iv);
  }, [playing]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={name} className="w-full max-w-lg overflow-hidden rounded-[28px] bg-surface" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Зупинити анімацію" : "Відтворити анімацію"}
          className="relative block aspect-[3/2] w-full bg-black"
        >
          {frames.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt={i === 0 ? `${name}: початкове положення` : `${name}: кінцеве положення`}
              className={cx("absolute inset-0 size-full object-cover transition-opacity duration-300", frame === i ? "opacity-100" : "opacity-0")}
            />
          ))}
        </button>
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="truncate text-[17px] font-semibold">{name}</div>
            <div className="text-xs text-muted">
              {frame === 0 ? "Початкове положення" : "Кінцеве положення"} · торкніться фото, щоб {playing ? "зупинити" : "продовжити"}
            </div>
            {exerciseId && (
              <Link href={`/exercises/${exerciseId}`} className="mt-1 inline-block text-sm text-accent">
                Історія та прогрес у вправі →
              </Link>
            )}
          </div>
          <button onClick={onClose} aria-label="Закрити" className="icon-btn bg-surface-2">
            <X size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Notes ─────────────────────────

export function NotesField({
  value,
  placeholder,
  onSave,
  startOpen = false,
}: {
  value: string | null;
  placeholder: string;
  onSave: (v: string | null) => void;
  /** show the field straight away even when there is no note yet */
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(value) || startOpen);
  const [text, setText] = useState(value ?? "");
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    // Changed elsewhere (e.g. Claude added a note) — adopt it.
    setSeen(value);
    setText(value ?? "");
    if (value) setOpen(true);
  }
  // The field is as tall as its text — a long note (e.g. one written by Claude) is never cut off.
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [text, open]);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <StickyNote size={15} /> Додати нотатку
      </button>
    );
  }
  return (
    <textarea
      ref={field}
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
      className="field resize-none overflow-hidden text-[15px] leading-snug"
    />
  );
}

export { useLockScroll };
