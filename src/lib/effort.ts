/**
 * How hard a finished workout felt, in the athlete's own words: 1 (very easy) – 10 (all out).
 * Kept next to the workout so later analysis can set the numbers against the feeling.
 */

export const EFFORT_MAX = 10;

export type EffortLevel = { key: "easy" | "moderate" | "hard" | "max"; label: string; hint: string; text: string; bg: string; color: string };

const LEVELS: (EffortLevel & { upTo: number })[] = [
  { upTo: 3, key: "easy", label: "Легко", hint: "міг би зробити значно більше", text: "text-sleep", bg: "bg-sleep", color: "var(--c-sleep)" },
  { upTo: 6, key: "moderate", label: "Помірно", hint: "робоче тренування із запасом", text: "text-good", bg: "bg-good", color: "var(--good)" },
  { upTo: 8, key: "hard", label: "Важко", hint: "запасу майже не лишилось", text: "text-activity", bg: "bg-activity", color: "var(--c-activity)" },
  { upTo: 10, key: "max", label: "На межі", hint: "більше не зміг би", text: "text-heart", bg: "bg-heart", color: "var(--c-heart)" },
];

export function effortLevel(value: number): EffortLevel {
  return LEVELS.find((l) => value <= l.upTo) ?? LEVELS[LEVELS.length - 1];
}

/** A whole number from 1 to 10, or null for anything else. */
export function normalizeEffort(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 1 && r <= EFFORT_MAX ? r : null;
}

/** Average of the rated workouts, to one decimal; null when none is rated. */
export function averageEffort(values: (number | null | undefined)[]): number | null {
  const rated = values.filter((v): v is number => typeof v === "number");
  if (rated.length === 0) return null;
  return Math.round((rated.reduce((a, v) => a + v, 0) / rated.length) * 10) / 10;
}
