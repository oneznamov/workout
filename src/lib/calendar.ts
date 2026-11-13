import "server-only";
import { monthGrid } from "./calendar-logic";
import { listCardio, type CardioSession } from "./cardio";
import { addDays, dayOf } from "./format";
import { listWorkouts, type WorkoutListItem } from "./workouts";

export type DayItems = { workouts: WorkoutListItem[]; cardio: CardioSession[] };

/**
 * Everything on the days a month's calendar shows (the month and the ends of its
 * neighbours): finished, running and planned workouts, and cardio that is not already part
 * of a diary workout. Keyed by local day, oldest first within a day.
 */
export async function getCalendarDays(userId: string, month: string): Promise<Record<string, DayItems>> {
  const grid = monthGrid(month);
  const from = grid[0];
  const to = grid[41];
  // A day either side: the lists filter by UTC days, the calendar shows local ones.
  const [workouts, cardio] = await Promise.all([
    listWorkouts(userId, { status: ["completed", "planned", "in_progress"], from: addDays(from, -1), to: addDays(to, 1), limit: 400 }),
    listCardio(userId, { from: addDays(from, -1), to: addDays(to, 1) }),
  ]);
  const days: Record<string, DayItems> = {};
  const at = (day: string) => (days[day] ??= { workouts: [], cardio: [] });
  for (const w of [...workouts].reverse()) {
    const day = w.status === "planned" ? w.scheduledFor : w.startedAt ? dayOf(w.startedAt) : w.scheduledFor;
    if (day && day >= from && day <= to) at(day).workouts.push(w);
  }
  for (const c of [...cardio].reverse()) {
    const day = dayOf(c.startAt);
    // A watch session that belongs to a diary workout is already shown with that workout.
    if (day >= from && day <= to && !c.workoutId) at(day).cardio.push(c);
  }
  return days;
}
