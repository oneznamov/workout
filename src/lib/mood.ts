/**
 * How a finished workout felt, in one emoji, and the athlete's own short note about it — the
 * two things a journal entry carries besides the numbers. Pure.
 */
export const MOODS = [
  { emoji: "🔥", label: "Вогонь" },
  { emoji: "😎", label: "Чудово" },
  { emoji: "🙂", label: "Добре" },
  { emoji: "😐", label: "Так собі" },
  { emoji: "😮‍💨", label: "Виснажливо" },
  { emoji: "😴", label: "Без сил" },
  { emoji: "🤕", label: "Щось боліло" },
] as const;

export const COMMENT_MAX = 280;

/** Only the moods on the list are kept; anything else is no mood. */
export function normalizeMood(v: unknown): string | null {
  return typeof v === "string" && MOODS.some((m) => m.emoji === v) ? v : null;
}

export const moodLabel = (emoji: string | null | undefined): string | null => MOODS.find((m) => m.emoji === emoji)?.label ?? null;

/** A note is plain text, trimmed and short; an empty one is no note. */
export function normalizeComment(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const text = v.replace(/\s+/g, " ").trim().slice(0, COMMENT_MAX);
  return text || null;
}
