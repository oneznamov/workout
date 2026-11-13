import { addDays, fmtDate, weekStart } from "./format";

/**
 * The training journal: everything done, newest week first, each week a list of its days
 * (newest first) and each day its sessions in the order they happened. Pure.
 */
export type JournalWeek<T> = { monday: string; days: { day: string; entries: T[] }[] };

export function journalWeeks<T extends { day: string; at: number }>(entries: T[]): JournalWeek<T>[] {
  const weeks = new Map<string, Map<string, T[]>>();
  for (const e of entries) {
    const monday = weekStart(e.day);
    const days = weeks.get(monday) ?? new Map<string, T[]>();
    weeks.set(monday, days);
    days.set(e.day, [...(days.get(e.day) ?? []), e]);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monday, days]) => ({
      monday,
      days: [...days.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([day, list]) => ({ day, entries: [...list].sort((a, b) => a.at - b.at) })),
    }));
}

/** "Цей тиждень", "Минулий тиждень", else the dates: "2–8 листопада", "30 листопада – 6 грудня". */
export function weekTitle(monday: string, today: string): string {
  const current = weekStart(today);
  if (monday === current) return "Цей тиждень";
  if (monday === addDays(current, -7)) return "Минулий тиждень";
  const sunday = addDays(monday, 6);
  const long = { day: "numeric", month: "long" } as const;
  return monday.slice(0, 7) === sunday.slice(0, 7) ? `${fmtDate(monday, { day: "numeric" })}–${fmtDate(sunday, long)}` : `${fmtDate(monday, long)} – ${fmtDate(sunday, long)}`;
}
