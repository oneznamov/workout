import type { Equipment, HrSample, MuscleGroup, SetType, Tracking, WorkoutStatus } from "@/db/schema";

/** Plain-JSON shapes shared by server pages, the polling API and client components. */

export type CSet = {
  id: string;
  type: SetType;
  weight: number | null;
  reps: number | null;
  durationSec: number | null;
  distanceM: number | null;
  completed: boolean;
  /** ISO time the set was ticked off (drives the workout timeline). */
  completedAt: string | null;
};

export type CExerciseInfo = {
  id: string;
  name: string;
  nameUk: string | null;
  muscle: MuscleGroup;
  equipment: Equipment;
  tracking: Tracking;
};

export type CExercise = {
  id: string;
  exercise: CExerciseInfo;
  restSeconds: number | null;
  notes: string | null;
  sets: CSet[];
};

export type CHealthWorkout = {
  id: string;
  activityType: string;
  startAt: string;
  endAt: string;
  durationSec: number | null;
  activeKcal: number | null;
  totalKcal: number | null;
  avgHr: number | null;
  maxHr: number | null;
  minHr: number | null;
  hrSamples: HrSample[] | null;
};

export type CWorkout = {
  id: string;
  name: string;
  status: WorkoutStatus;
  scheduledFor: string | null;
  startedAt: string | null;
  endedAt: string | null;
  /** seconds of finished pauses; `pausedAt` is set while paused right now */
  pausedSec: number;
  pausedAt: string | null;
  notes: string | null;
  updatedAt: string;
  exercises: CExercise[];
  health: CHealthWorkout[];
};

export type CLast = Record<
  string,
  {
    date: string | null;
    sets: { weight: number | null; reps: number | null; durationSec: number | null; distanceM: number | null; type: SetType }[];
  }
>;

type ServerWorkout = {
  id: string;
  name: string;
  status: WorkoutStatus;
  scheduledFor: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  pausedSec: number;
  pausedAt: Date | null;
  notes: string | null;
  updatedAt: Date;
  exercises: {
    id: string;
    restSeconds: number | null;
    notes: string | null;
    exercise: CExerciseInfo;
    sets: (Omit<CSet, "completedAt"> & { completedAt: Date | null })[];
  }[];
  healthWorkouts: {
    id: string;
    activityType: string;
    startAt: Date;
    endAt: Date;
    durationSec: number | null;
    activeKcal: number | null;
    totalKcal: number | null;
    avgHr: number | null;
    maxHr: number | null;
    minHr: number | null;
    hrSamples: HrSample[] | null;
  }[];
};

export function toClientWorkout(w: ServerWorkout): CWorkout {
  return {
    id: w.id,
    name: w.name,
    status: w.status,
    scheduledFor: w.scheduledFor,
    startedAt: w.startedAt?.toISOString() ?? null,
    endedAt: w.endedAt?.toISOString() ?? null,
    pausedSec: w.pausedSec,
    pausedAt: w.pausedAt?.toISOString() ?? null,
    notes: w.notes,
    updatedAt: w.updatedAt.toISOString(),
    exercises: w.exercises.map((we) => ({
      id: we.id,
      exercise: we.exercise,
      restSeconds: we.restSeconds,
      notes: we.notes,
      sets: we.sets.map((s) => ({
        id: s.id,
        type: s.type,
        weight: s.weight,
        reps: s.reps,
        durationSec: s.durationSec,
        distanceM: s.distanceM,
        completed: s.completed,
        completedAt: s.completedAt?.toISOString() ?? null,
      })),
    })),
    health: w.healthWorkouts.map((h) => ({
      id: h.id,
      activityType: h.activityType,
      startAt: h.startAt.toISOString(),
      endAt: h.endAt.toISOString(),
      durationSec: h.durationSec,
      activeKcal: h.activeKcal,
      totalKcal: h.totalKcal,
      avgHr: h.avgHr,
      maxHr: h.maxHr,
      minHr: h.minHr,
      hrSamples: h.hrSamples,
    })),
  };
}

export function toClientLast(
  last: Record<string, { date: Date | null; sets: CLast[string]["sets"] }>,
): CLast {
  return Object.fromEntries(
    Object.entries(last).map(([k, v]) => [k, { date: v.date?.toISOString() ?? null, sets: v.sets }]),
  );
}

/** "80 × 8", "12 повт", "1:30", "2.5 км" */
export function describeSet(
  tracking: Tracking,
  s: { weight: number | null; reps: number | null; durationSec: number | null; distanceM: number | null },
) {
  const w = s.weight != null ? String(Math.round(s.weight * 100) / 100) : null;
  switch (tracking) {
    case "weight_reps":
      return `${w ?? "—"} × ${s.reps ?? "—"}`;
    case "reps":
      return w && s.weight !== 0 ? `+${w} × ${s.reps ?? "—"}` : `${s.reps ?? "—"} повт`;
    case "duration": {
      const sec = s.durationSec ?? 0;
      return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    }
    case "distance": {
      const km = s.distanceM != null ? `${Math.round(s.distanceM / 10) / 100} км` : "—";
      const min = s.durationSec != null ? ` · ${Math.round(s.durationSec / 60)} хв` : "";
      return km + min;
    }
  }
}

/** What the device sends when saving: the whole workout plus explicit deletions. */
export type WorkoutSnapshot = {
  workout: CWorkout;
  deletedExerciseIds: string[];
  deletedSetIds: string[];
};

export type OfflineBundle = {
  workouts: CWorkout[];
  exercises: CExerciseInfo[];
  last: CLast;
  fetchedAt: string;
};

/** Seconds actually spent training: total time minus pauses (including one in progress). */
export function activeSeconds(w: Pick<CWorkout, "startedAt" | "endedAt" | "pausedSec" | "pausedAt">, now = Date.now()) {
  if (!w.startedAt) return 0;
  const end = w.endedAt ? +new Date(w.endedAt) : now;
  const pausing = w.pausedAt ? Math.max(0, end - +new Date(w.pausedAt)) : 0;
  return Math.max(0, (end - +new Date(w.startedAt) - pausing) / 1000 - (w.pausedSec ?? 0));
}
