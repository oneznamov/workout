/**
 * "Add a little when it went well": if last time the same set was done with at least the
 * planned reps, suggest the next step up in weight. Pure — used in the workout screen and tests.
 */
type SetNumbers = { weight: number | null; reps: number | null };

export function suggestWeight(planned: SetNumbers, previous: SetNumbers | undefined): number | null {
  if (!previous?.weight || !previous.reps) return null;
  const wanted = planned.reps ?? previous.reps;
  if (previous.reps < wanted) return null;
  const step = previous.weight >= 20 ? 2.5 : 1;
  const next = Math.round((previous.weight + step) * 100) / 100;
  // Nothing to suggest when the plan is already at or above the next step.
  return planned.weight != null && planned.weight >= next ? null : next;
}
