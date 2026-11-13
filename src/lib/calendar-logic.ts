import type { CardioKind } from "./cardio-kinds";
import { addDays, fmtDate, weekStart } from "./format";

/** One session of a day: a strength workout or a kind of cardio. */
export type SessionKind = "strength" | CardioKind;

/**
 * What happened or is planned on one day: finished strength workouts, planned ones, cardio
 * sessions — and `kinds`, every session actually done that day, in the order it was added.
 */
export type DayMark = { done: number; planned: number; cardio: number; kinds: SessionKind[] };
export const NO_MARK: DayMark = { done: 0, planned: 0, cardio: 0, kinds: [] };

/** Sessions actually done that day — strength and cardio together. */
export const sessionsOn = (m: DayMark | undefined) => (m ? m.done + m.cardio : 0);

export const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
export const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** The six Monday-first weeks that cover a month ("2026-11"), as 42 days — the range data is loaded for. */
export function monthGrid(month: string): string[] {
  const first = weekStart(`${month}-01`);
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

/** Only the weeks the month actually touches (four to six of them) — what the calendar draws. */
export function monthWeeks(month: string): string[] {
  const grid = monthGrid(month);
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  return grid.slice(0, (Math.floor(grid.indexOf(last) / 7) + 1) * 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Adds one to a counter of a day's mark; a done or cardio session is also remembered by its kind. */
export function mark(marks: Record<string, DayMark>, day: string, kind: "done" | "planned" | "cardio", cardio?: CardioKind) {
  const m = (marks[day] ??= { done: 0, planned: 0, cardio: 0, kinds: [] });
  m[kind]++;
  if (kind === "done") m.kinds.push("strength");
  if (kind === "cardio") m.kinds.push(cardio ?? "other");
}

/** How a day's circle is drawn. "missed" — something was planned, the day passed, nothing was done. */
export type DayState = "done" | "planned" | "missed" | "none";
export function dayState(m: DayMark | undefined, day: string, today: string): DayState {
  if (!m) return "none";
  if (m.done > 0) return "done";
  if (m.planned > 0) return day < today ? "missed" : "planned";
  return "none";
}

const KIND_ORDER: SessionKind[] = ["strength", "run", "cycle", "walk", "other"];

/**
 * A day's sessions as the arcs of its ring: always in the same order (strength first, then
 * cardio by kind), whatever order they were recorded in, and never more than fit legibly.
 */
export function sessionSegments(kinds: SessionKind[], max = 6): SessionKind[] {
  return [...kinds].sort((a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b)).slice(0, max);
}

/** "Листопад 2026" for "2026-11". */
export function monthTitle(month: string) {
  const title = fmtDate(`${month}-15`, { month: "long", year: "numeric" }).replace(/\s*р\.?$/, "");
  return title.charAt(0).toUpperCase() + title.slice(1);
}
