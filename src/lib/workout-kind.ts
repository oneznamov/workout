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
const SINGLE: [MuscleGroup, string][] = [
  ["chest", "Груди"],
  ["back", "Спина"],
  ["shoulders", "Плечі"],
];

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
  const zones: BodyZones = {
    shoulders: whole || of("shoulders") > 0,
    torso: whole || of("chest") + of("back") > 0,
    arms: whole || sum(ARMS) > 0,
    core: whole || of("core") > 0,
    legs: whole || sum(LOWER) + of("cardio") > 0,
  };
  const kind = (key: string, label: string, cardio = false): WorkoutKind => ({ key, label, zones, cardio });
  if (total === 0) return kind("empty", "Без вправ");

  const upper = sum(UPPER);
  const lower = sum(LOWER);
  if (of("cardio") / total >= 0.6) return kind("cardio", "Кардіо", true);
  if (of("core") / total >= 0.6) return kind("core", "Прес");
  if (lower / total >= 0.7 || (upper === 0 && !whole && lower > 0)) return kind("legs", "Ноги");
  if (upper / total >= 0.7 || (lower === 0 && !whole && upper > 0)) {
    for (const [m, label] of SINGLE) if (of(m) / upper >= 0.7) return kind(m, label);
    if (sum(ARMS) / upper >= 0.75) return kind("arms", "Руки");
    if (sum(PUSH) / upper >= 0.8) return kind("push", "Жимове");
    if (sum(PULL) / upper >= 0.8) return kind("pull", "Тягове");
    return kind("upper", "Верх тіла");
  }
  return kind("full", "Фулбоді");
}
