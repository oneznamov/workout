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

export type MuscleContribution = { week: string; muscle: MuscleGroup; exerciseId: string; name: string; sets: number };

export type MuscleBalance = {
  /** Monday of each week, oldest → newest. */
  weeks: string[];
  today: string;
  contributions: MuscleContribution[];
  lastTrained: Partial<Record<MuscleGroup, string>>;
  suggestions: Record<MuscleGroup, { id: string; name: string; nameUk: string | null; done: number }[]>;
};
