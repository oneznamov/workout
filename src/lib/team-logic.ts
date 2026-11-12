import { addDays, weekStart } from "./format";

/**
 * How many weeks in a row (ending this week or last week) had at least one training day.
 * Weeks in `paused` (illness) neither count nor break the streak.
 */
export function weekStreak(trainingDays: Iterable<string>, today: string, paused: Set<string> = new Set()): number {
  const weeks = new Set<string>();
  for (const d of trainingDays) weeks.add(weekStart(d));
  let cursor = weekStart(today);
  // The current week may not have a workout yet — the streak is still alive.
  if (!weeks.has(cursor)) cursor = addDays(cursor, -7);
  let n = 0;
  for (let guard = 0; guard < 520; guard++) {
    if (weeks.has(cursor)) n++;
    else if (!paused.has(cursor)) break;
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

/** Reactions a teammate can leave on a finished workout. */
export const REACTIONS = ["💪", "🔥", "👏"] as const;

/** A shared weekly target: everyone reaches it on their own, or the team adds up to it together. */
export type TeamChallenge = { metric: Exclude<BoardMetric, "streak">; target: number; mode: "each" | "team" };
export const CHALLENGE_METRICS = BOARD_METRICS.filter((m) => m.key !== "streak");

export function normalizeChallenge(input: unknown): TeamChallenge | null {
  if (!input || typeof input !== "object") return null;
  const c = input as Record<string, unknown>;
  const metric = CHALLENGE_METRICS.find((m) => m.key === c.metric)?.key;
  const target = Number(c.target);
  if (!metric || !Number.isFinite(target) || target <= 0) return null;
  return { metric: metric as TeamChallenge["metric"], target: Math.round(target * 10) / 10, mode: c.mode === "team" ? "team" : "each" };
}

/** Where everyone stands against the challenge this week. */
export function challengeProgress(challenge: TeamChallenge, rows: BoardRow[]) {
  const people = rows.map((r) => ({ userId: r.userId, name: r.name, me: r.me, value: r[challenge.metric], done: r[challenge.metric] >= challenge.target }));
  const total = people.reduce((a, p) => a + p.value, 0);
  return {
    people: people.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)),
    total,
    done: challenge.mode === "team" ? total >= challenge.target : people.length > 0 && people.every((p) => p.done),
  };
}
