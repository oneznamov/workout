"use client";

import { useState } from "react";
import { COMMENT_MAX, MOODS, moodLabel, normalizeComment } from "@/lib/mood";
import { cx } from "@/lib/format";

/** One tap: how the workout felt. Tapping the chosen one again takes it back. */
export function MoodPicker({ value, onChange }: { value: string | null; onChange: (mood: string | null) => void }) {
  return (
    <div>
      <div role="radiogroup" aria-label="Настрій після тренування" className="flex justify-between gap-1">
        {MOODS.map((m) => {
          const on = value === m.emoji;
          return (
            <button
              key={m.emoji}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={m.label}
              title={m.label}
              onClick={() => onChange(on ? null : m.emoji)}
              className={cx(
                "grid aspect-square max-w-11 flex-1 place-items-center rounded-full text-[22px] leading-none transition",
                on ? "bg-accent/25 ring-2 ring-accent" : cx("bg-surface-2 hover:bg-surface-3", value && "opacity-45"),
              )}
            >
              <span aria-hidden="true">{m.emoji}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 min-h-5 text-sm text-ink-2" aria-live="polite">
        {moodLabel(value) ?? <span className="text-muted">Не вибрано</span>}
      </p>
    </div>
  );
}

/** The athlete's own line about the workout; saved when the field is left. */
export function CommentField({ value, onSave }: { value: string | null; onSave: (comment: string | null) => void }) {
  const [text, setText] = useState(value ?? "");
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    // Changed elsewhere (another device) — adopt it.
    setSeen(value);
    setText(value ?? "");
  }
  return (
    <textarea
      value={text}
      rows={2}
      maxLength={COMMENT_MAX}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const next = normalizeComment(text);
        if (next !== value) onSave(next);
      }}
      placeholder="Нотатка для журналу: як пройшло, що запамʼятати"
      aria-label="Нотатка до тренування"
      className="field resize-none text-[15px]"
    />
  );
}

/** Mood and note of a finished workout — what the journal shows next to the numbers. */
export function FeelCard({ mood, comment, onMood, onComment }: { mood: string | null; comment: string | null; onMood: (mood: string | null) => void; onComment: (comment: string | null) => void }) {
  return (
    <section className="card space-y-3 p-4" aria-label="Настрій і нотатка">
      <div className="text-[13px] font-semibold text-ink-2">Як пройшло</div>
      <MoodPicker value={mood} onChange={onMood} />
      <CommentField value={comment} onSave={onComment} />
    </section>
  );
}
