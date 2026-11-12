import { addDays, fmtDate, weekStart } from "./format";

/** What happened or is planned on one day: finished strength workouts, planned ones, cardio sessions. */
export type DayMark = { done: number; planned: number; cardio: number };
export const NO_MARK: DayMark = { done: 0, planned: 0, cardio: 0 };

/** Sessions actually done that day — strength and cardio together. */
export const sessionsOn = (m: DayMark | undefined) => (m ? m.done + m.cardio : 0);

export const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
export const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** The six Monday-first weeks that cover a month ("2026-11"), as 42 days. */
export function monthGrid(month: string): string[] {
  const first = weekStart(`${month}-01`);
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Adds one to a counter of a day's mark. */
export function mark(marks: Record<string, DayMark>, day: string, kind: keyof DayMark) {
  (marks[day] ??= { done: 0, planned: 0, cardio: 0 })[kind]++;
}

/** "Листопад 2026" for "2026-11". */
export const monthTitle = (month: string) => fmtDate(`${month}-15`, { month: "long", year: "numeric" }).replace(/\s*р\.?$/, "");
