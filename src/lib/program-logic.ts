/** Pure helpers for training programmes — shared by the server, the interface and tests. */

export type ProgramStatus = "upcoming" | "active" | "finished";
export const PROGRAM_STATUS_LABEL: Record<ProgramStatus, string> = { upcoming: "Попереду", active: "Триває", finished: "Завершена" };

export function programStatus(p: { startsOn: string; endsOn: string }, today: string): ProgramStatus {
  return today < p.startsOn ? "upcoming" : today > p.endsOn ? "finished" : "active";
}

/** Which week of the programme a day falls into (1-based), counting from its first day. */
export function programWeek(startsOn: string, day: string): number {
  const days = Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${startsOn}T12:00:00Z`)) / 86400000);
  return Math.max(1, Math.floor(days / 7) + 1);
}

/** Number of weeks a programme spans. */
export function programWeeks(p: { startsOn: string; endsOn: string }): number {
  return programWeek(p.startsOn, p.endsOn);
}
