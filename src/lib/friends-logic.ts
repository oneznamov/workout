import { addDays, weekStart } from "./format";

/** How many weeks in a row (ending this week or last week) had at least one training day. */
export function weekStreak(trainingDays: Iterable<string>, today: string): number {
  const weeks = new Set<string>();
  for (const d of trainingDays) weeks.add(weekStart(d));
  let cursor = weekStart(today);
  // The current week may not have a workout yet — the streak is still alive.
  if (!weeks.has(cursor)) cursor = addDays(cursor, -7);
  let n = 0;
  while (weeks.has(cursor)) {
    n++;
    cursor = addDays(cursor, -7);
  }
  return n;
}

export const BOARD_METRICS = [
  { key: "workouts", label: "Тренування", unit: "", digits: 0 },
  { key: "activeMin", label: "Активний час", unit: "хв", digits: 0 },
  { key: "volume", label: "Тоннаж", unit: "кг", digits: 0 },
  { key: "sets", label: "Підходи", unit: "", digits: 0 },
  { key: "cardioKm", label: "Кардіо", unit: "км", digits: 1 },
  { key: "streak", label: "Тижнів поспіль", unit: "", digits: 0 },
] as const;
export type BoardMetric = (typeof BOARD_METRICS)[number]["key"];

export type BoardRow = { userId: string; name: string; me: boolean } & Record<BoardMetric, number>;

/** Rows ordered for one metric; ties share a place (1, 2, 2, 4). */
export function rank(rows: BoardRow[], metric: BoardMetric) {
  const sorted = [...rows].sort((a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name));
  let place = 0;
  return sorted.map((r, i) => {
    if (i === 0 || r[metric] !== sorted[i - 1][metric]) place = i + 1;
    return { ...r, place, value: r[metric] };
  });
}

export const displayName = (username: string) => username.split("@")[0];
