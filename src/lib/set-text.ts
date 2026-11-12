type SetLike = { weight: number | null; reps: number | null; durationSec: number | null; distanceM: number | null };

/** A set in the shortest readable form: "60kg×8", "12" (bodyweight reps), "45s", "400m". */
export const setText = (s: SetLike) =>
  s.durationSec != null && s.reps == null
    ? `${s.durationSec}s`
    : s.distanceM != null && s.reps == null
      ? `${Math.round(s.distanceM)}m`
      : `${s.weight != null && s.weight > 0 ? `${s.weight}kg×` : ""}${s.reps ?? "?"}`;
