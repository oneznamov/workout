import { appConfig } from "./config";

/** Weekly targets shown as rings on the dashboard. */
export type Goals = {
  /** strength workouts per week */
  workouts: number;
  /** minutes of cardio per week */
  cardioMin: number;
  /** how many of the 11 muscle groups should reach the weekly norm */
  muscles: number;
};

export const DEFAULT_GOALS: Goals = { ...appConfig.weeklyGoals };

export const GOAL_LIMITS = {
  workouts: { min: 1, max: 14, step: 1 },
  cardioMin: { min: 10, max: 1200, step: 10 },
  muscles: { min: 1, max: 11, step: 1 },
} as const;

/** Fills in defaults and keeps every value inside its allowed range. */
export function normalizeGoals(input: Partial<Goals> | null | undefined): Goals {
  const pick = (key: keyof Goals) => {
    const v = Number(input?.[key]);
    const { min, max } = GOAL_LIMITS[key];
    return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : DEFAULT_GOALS[key];
  };
  return { workouts: pick("workouts"), cardioMin: pick("cardioMin"), muscles: pick("muscles") };
}
