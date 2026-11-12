import type { MuscleGroup } from "@/db/schema";

export type CardioKind = "run" | "cycle" | "walk" | "other";

/** Classifies an Apple Watch / manual activity name. null = not cardio (strength, yoga…). */
export function cardioKind(activityType: string): CardioKind | null {
  const a = activityType.toLowerCase();
  if (/run|jog|біг/.test(a)) return "run";
  if (/cycl|bik|ride|вело/.test(a)) return "cycle";
  if (/walk|hik|ходьб/.test(a)) return "walk";
  if (/ellipt|row|stair|swim|hiit|cardio|skat|ski|кардіо/.test(a)) return "other";
  return null;
}

export const CARDIO_LABEL: Record<CardioKind, string> = { run: "Біг", cycle: "Вело", walk: "Ходьба", other: "Кардіо" };
export const CARDIO_COLOR: Record<CardioKind, string> = {
  run: "var(--c-run)",
  cycle: "var(--c-cycle)",
  walk: "var(--c-activity)",
  other: "var(--c-heart)",
};
export const CARDIO_TONE: Record<CardioKind, string> = { run: "text-run", cycle: "text-cycle", walk: "text-activity", other: "text-heart" };

/**
 * How ten minutes of an activity loads each muscle group, relative to one hard set.
 * Deliberately modest: steady cardio is a much weaker growth stimulus than lifting.
 */
export const CARDIO_MUSCLES: Record<CardioKind, Partial<Record<MuscleGroup, number>>> = {
  run: { quads: 1, hamstrings: 1, calves: 1, glutes: 0.6, core: 0.3 },
  cycle: { quads: 1, glutes: 0.6, hamstrings: 0.5, calves: 0.5 },
  walk: { calves: 0.25, quads: 0.2, glutes: 0.2, hamstrings: 0.2 },
  other: {},
};

/** Effort multiplier from average heart rate relative to the user's highest recorded one. */
export function hrIntensity(avgHr: number | null | undefined, hrRef: number) {
  if (!avgHr || !hrRef) return 1;
  const r = avgHr / hrRef;
  if (r < 0.6) return 0.6;
  if (r < 0.7) return 0.8;
  if (r < 0.8) return 1;
  if (r < 0.9) return 1.2;
  return 1.4;
}

/** min/km for running & walking, km/h for cycling. */
export function paceLabel(kind: CardioKind, distanceM: number | null, durationSec: number | null) {
  if (!distanceM || !durationSec || distanceM < 50) return null;
  if (kind === "cycle") return `${(distanceM / 1000 / (durationSec / 3600)).toFixed(1)} км/год`;
  const secPerKm = durationSec / (distanceM / 1000);
  return `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, "0")} /км`;
}
