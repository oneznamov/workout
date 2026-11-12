type SetLike = { weight: number | null; reps: number | null; durationSec: number | null; distanceM: number | null; speedKmh?: number | null; incline?: number | null };

/** A set in the shortest readable form: "60kg×8", "12" (bodyweight reps), "45s", "400m", "20min @9km/h incline 2%". */
export const setText = (s: SetLike) => {
  const machine = `${s.speedKmh != null ? ` @${s.speedKmh}km/h` : ""}${s.incline != null ? ` incline ${s.incline}%` : ""}`;
  if (s.durationSec != null && s.reps == null) return `${machine && s.durationSec >= 120 ? `${Math.round(s.durationSec / 60)}min` : `${s.durationSec}s`}${machine}`;
  if (s.distanceM != null && s.reps == null) return `${Math.round(s.distanceM)}m${machine}`;
  if (machine && s.reps == null) return `done${machine}`;
  return `${s.weight != null && s.weight > 0 ? `${s.weight}kg×` : ""}${s.reps ?? "?"}`;
};
