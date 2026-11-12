import type { MuscleGroup } from "@/db/schema";

/** Which parts of the little body pictogram are lit. */
export type BodyZones = { shoulders: boolean; torso: boolean; arms: boolean; core: boolean; legs: boolean };
export type WorkoutKind = { key: string; label: string; zones: BodyZones; cardio: boolean };
export type MuscleCounts = Partial<Record<MuscleGroup, number>> | null | undefined;

const UPPER: MuscleGroup[] = ["chest", "back", "shoulders", "biceps", "triceps", "forearms"];
const LOWER: MuscleGroup[] = ["quads", "hamstrings", "glutes", "calves"];
const PUSH: MuscleGroup[] = ["chest", "shoulders", "triceps"];
const PULL: MuscleGroup[] = ["back", "biceps", "forearms"];
const ARMS: MuscleGroup[] = ["biceps", "triceps", "forearms"];
const SINGLE = ["chest", "back", "shoulders"] as const;

const ZONES = (...lit: (keyof BodyZones)[]): BodyZones => ({
  shoulders: lit.includes("shoulders"),
  torso: lit.includes("torso"),
  arms: lit.includes("arms"),
  core: lit.includes("core"),
  legs: lit.includes("legs"),
});

/** Every kind has one fixed picture, so the same kind of workout always looks the same in a list. */
const KINDS = {
  empty: { label: "Без вправ", zones: ZONES() },
  cardio: { label: "Кардіо", zones: ZONES("legs") },
  core: { label: "Прес", zones: ZONES("core") },
  legs: { label: "Ноги", zones: ZONES("legs") },
  chest: { label: "Груди", zones: ZONES("torso") },
  back: { label: "Спина", zones: ZONES("torso") },
  shoulders: { label: "Плечі", zones: ZONES("shoulders") },
  arms: { label: "Руки", zones: ZONES("arms") },
  push: { label: "Жимове", zones: ZONES("shoulders", "torso", "arms") },
  pull: { label: "Тягове", zones: ZONES("shoulders", "torso", "arms") },
  upper: { label: "Верх тіла", zones: ZONES("shoulders", "torso", "arms") },
  full: { label: "Фулбоді", zones: ZONES("shoulders", "torso", "arms", "core", "legs") },
} satisfies Record<string, { label: string; zones: BodyZones }>;

/**
 * Names a workout by what it trains ("Ноги", "Фулбоді", "Тягове"…) from the number of
 * exercises per primary muscle, and says which body zones to light up in its pictogram.
 */
export function workoutKind(counts: MuscleCounts): WorkoutKind {
  const c = counts ?? {};
  const of = (m: MuscleGroup) => c[m] ?? 0;
  const sum = (list: MuscleGroup[]) => list.reduce((a, m) => a + of(m), 0);
  const total = Object.values(c).reduce<number>((a, x) => a + (x ?? 0), 0);
  const whole = of("full_body") > 0;
  const kind = (key: keyof typeof KINDS): WorkoutKind => ({ key, ...KINDS[key], cardio: key === "cardio" });
  if (total === 0) return kind("empty");

  const upper = sum(UPPER);
  const lower = sum(LOWER);
  if (of("cardio") / total >= 0.6) return kind("cardio");
  if (of("core") / total >= 0.6) return kind("core");
  if (lower / total >= 0.7 || (upper === 0 && !whole && lower > 0)) return kind("legs");
  if (upper / total >= 0.7 || (lower === 0 && !whole && upper > 0)) {
    for (const m of SINGLE) if (of(m) / upper >= 0.7) return kind(m);
    if (sum(ARMS) / upper >= 0.75) return kind("arms");
    if (sum(PUSH) / upper >= 0.8) return kind("push");
    if (sum(PULL) / upper >= 0.8) return kind("pull");
    return kind("upper");
  }
  return kind("full");
}
