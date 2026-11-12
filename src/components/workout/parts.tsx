"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, StickyNote, X } from "lucide-react";
import type { Tracking } from "@/db/schema";
import { exerciseFrames } from "@/lib/exercise-media";
import { cx, fmtClock } from "@/lib/format";
import type { CSet } from "@/lib/shape";

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
  size?: "md" | "xl";
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
        size === "xl" ? "h-16 rounded-2xl bg-transparent text-[2.5rem]" : "h-12 rounded-xl text-xl",
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 md:items-center" onClick={onClose}>
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

/** Big circular rest countdown. The ring drains smoothly and pulses for the last seconds. */
export function RestRing({
  rest,
  onAdjust,
  onDone,
  children,
}: {
  rest: { endsAt: number; total: number };
  onAdjust: (deltaSec: number) => void;
  onDone: (natural: boolean) => void;
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
  const size = 232;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, left / rest.total));
  const ending = left <= 5;
  return (
    <div className="card flex flex-col items-center p-5">
      <div className="caps">Відпочинок</div>
      <div className={cx("relative mt-3", ending && "animate-pulse")} style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={ending ? "var(--warning)" : "var(--accent)"}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${Math.max(0.01, p * len)} ${len}`}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className={cx("num text-[4rem] leading-none font-semibold", ending ? "text-warning" : "text-ink")} role="timer" aria-live="off">
              {fmtClock(Math.ceil(Math.max(0, left)))}
            </div>
            <div className="mt-1 text-xs text-muted">з {fmtClock(rest.total)}</div>
          </div>
        </div>
      </div>
      <div className="mt-4 flex w-full gap-2">
        <button onClick={() => onAdjust(-15)} disabled={left < 35} className="btn btn-ghost flex-1">
          −15 с
        </button>
        <button onClick={() => onAdjust(15)} className="btn btn-ghost flex-1">
          +15 с
        </button>
        <button onClick={() => onDone(false)} className="btn btn-primary flex-1">
          Далі
        </button>
      </div>
      {children}
    </div>
  );
}

// ───────────────────────── Exercise animation ─────────────────────────

/** Small thumbnail; tap to open the two-frame "how to do it" animation. */
export function ExerciseThumb({ name, size = 48 }: { name: string; size?: number }) {
  const frames = exerciseFrames(name);
  const [open, setOpen] = useState(false);
  if (!frames) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`Показати, як виконувати: ${name}`}
        className="shrink-0 overflow-hidden rounded-xl bg-surface-2 ring-1 ring-white/10"
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={frames[0]} alt="" loading="lazy" className="size-full object-cover" />
      </button>
      {open && <ExerciseAnimation name={name} frames={frames} onClose={() => setOpen(false)} />}
    </>
  );
}

function ExerciseAnimation({ name, frames, onClose }: { name: string; frames: [string, string]; onClose: () => void }) {
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
