import type { MuscleGroup } from "@/db/schema";

/** Muscle groups that are drawn on the body map (cardio / full_body are not body regions). */
export const BODY_MUSCLES: MuscleGroup[] = [
  "chest", "back", "shoulders", "biceps", "triceps", "forearms",
  "core", "glutes", "quads", "hamstrings", "calves",
];

/** Weekly working-set guideline per muscle group. */
export const TARGET_MIN = 10;
export const TARGET_MAX = 20;
export const LOW_MAX = 5;

export type MuscleStatus = "none" | "low" | "below" | "optimal" | "high";

export function muscleStatus(setsPerWeek: number): MuscleStatus {
  if (setsPerWeek <= 0) return "none";
  if (setsPerWeek < LOW_MAX) return "low";
  if (setsPerWeek < TARGET_MIN) return "below";
  if (setsPerWeek <= TARGET_MAX) return "optimal";
  return "high";
}

export const STATUS_INFO: Record<MuscleStatus, { label: string; range: string; fill: string; needsWork: boolean }> = {
  none: { label: "Не тренувались", range: "0", fill: "#474743", needsWork: true },
  low: { label: "Мало", range: "1–4", fill: "#184f95", needsWork: true },
  below: { label: "Нижче норми", range: "5–9", fill: "#2a78d6", needsWork: true },
  optimal: { label: "Норма", range: "10–20", fill: "#5598e7", needsWork: false },
  high: { label: "Багато", range: "20+", fill: "#b7d3f6", needsWork: false },
};
export const STATUS_ORDER: MuscleStatus[] = ["none", "low", "below", "optimal", "high"];

/** Heat scale: untouched → a faint tint → green/lime in the target range → orange/red when overdone. */
export const LOAD_STOPS: [number, string][] = [
  [0, "#3a3a3c"],
  [3, "#40c8e0"],
  [7, "#30d158"],
  [12, "#a4e83c"],
  [18, "#ffd60a"],
  [24, "#ff9f0a"],
  [30, "#ff453a"],
];

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

/** Color for a weekly load value, interpolated along LOAD_STOPS. */
export function loadColor(load: number): string {
  if (!(load > 0)) return LOAD_STOPS[0][1];
  const last = LOAD_STOPS[LOAD_STOPS.length - 1];
  if (load >= last[0]) return last[1];
  const i = LOAD_STOPS.findIndex(([v]) => v > load);
  const [v0, c0] = LOAD_STOPS[i - 1];
  const [v1, c1] = LOAD_STOPS[i];
  const t = (load - v0) / (v1 - v0);
  const a = hex(c0);
  const b = hex(c1);
  return `rgb(${a.map((x, k) => Math.round(x + (b[k] - x) * t)).join(" ")})`;
}

/** `sets` is the load in points (1 ≈ one hard working set for that muscle). */
export type MuscleContribution = { week: string; muscle: MuscleGroup; exerciseId: string; name: string; sets: number; cardio?: boolean };

/** Cardio per week. `load` puts minutes on the same heat scale: 150 intensity-minutes ≈ 12 points. */
export type CardioLoad = { week: string; label: string; minutes: number; load: number };
export const CARDIO_MINUTES_PER_POINT = 12.5;

export type MuscleBalance = {
  /** Monday of each week, oldest → newest. */
  weeks: string[];
  today: string;
  contributions: MuscleContribution[];
  cardio: CardioLoad[];
  lastTrained: Partial<Record<MuscleGroup, string>>;
  suggestions: Record<MuscleGroup, { id: string; name: string; nameUk: string | null; done: number }[]>;
};
