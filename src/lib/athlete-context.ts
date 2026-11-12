import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getMuscleSummary, getRecords } from "./analytics";
import { addDays, dayOf, TZ } from "./format";
import { goalProgress } from "./goal-progress";
import { normalizeGoals } from "./goals";
import { getMetricSeries, listHealthWorkouts } from "./health";
import { MEASURES } from "./measurements";
import { ageOn, normalizeProfile, personName } from "./profile";
import { programsForContext } from "./programs";
import { setText } from "./set-text";
import { notableVitals } from "./vitals";
import { workoutKind } from "./workout-kind";
import { listWorkoutsFull } from "./workouts";

const VITALS: [string, string][] = [
  ["body_fat_percentage", "%"],
  ["resting_heart_rate", "bpm"],
  ["heart_rate_variability", "ms"],
  ["sleep_analysis", "hours"],
  ["vo2_max", "ml/kg/min"],
  ["step_count", "steps/day"],
];
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * One document with everything the app knows about the athlete — who they are, what they
 * want, their body and recovery, and what they have been doing. It is the single source for
 * every AI: the built-in coach gets it in each prompt, Claude reads it through the
 * `get_athlete_context` tool, and any other assistant can fetch it from GET /api/context.
 */
export async function getAthleteContext(userId: string, opts: { history?: number } = {}) {
  const today = dayOf();
  const [[u], recent, planned, muscles, weight, vitals, measures, watch, records, programmes] = await Promise.all([
    db.select({ username: users.username, profile: users.profile, goals: users.goals }).from(users).where(eq(users.id, userId)),
    listWorkoutsFull(userId, ["completed"], opts.history ?? 12),
    listWorkoutsFull(userId, ["planned"], 10),
    getMuscleSummary(userId, 6),
    getMetricSeries(userId, ["body_mass"], addDays(today, -90)),
    getMetricSeries(
      userId,
      VITALS.map(([m]) => m),
      addDays(today, -28),
    ),
    getMetricSeries(
      userId,
      MEASURES.map((m) => m.key),
    ),
    listHealthWorkouts(userId, { from: addDays(today, -21), limit: 30 }),
    getRecords(userId, addDays(today, -30), 8),
    programsForContext(userId),
  ]);
  const profile = normalizeProfile(u?.profile);
  const targets = normalizeGoals(u?.goals);
  const progress = await goalProgress(userId, profile);
  const lastWeight = weight.at(-1);

  type Full = (typeof recent)[number];
  const workout = (w: Full, completedOnly: boolean) => {
    const counts: Record<string, number> = {};
    for (const e of w.exercises) counts[e.exercise.muscle] = (counts[e.exercise.muscle] ?? 0) + 1;
    return {
      date: w.startedAt ? dayOf(w.startedAt) : w.scheduledFor,
      name: w.name,
      kind: workoutKind(counts).key,
      minutes: w.startedAt && w.endedAt ? Math.round(Math.max(0, (w.endedAt.getTime() - w.startedAt.getTime()) / 1000 - w.pausedSec) / 60) : null,
      note: w.notes || undefined,
      effort_1_to_10: w.effort ?? undefined,
      expected_effort_1_to_10: w.expectedEffort ?? undefined,
      exercises: w.exercises.map((e) => ({
        name: e.exercise.name,
        muscle: e.exercise.muscle,
        sets: e.sets
          .filter((s) => !completedOnly || s.completed)
          .map(setText)
          .join(", "),
        note: e.notes || undefined,
      })),
    };
  };

  return {
    schema: "workout/athlete-context@1",
    units: "dates YYYY-MM-DD, weights kg, lengths cm, durations as stated",
    effort_scale: "effort_1_to_10 on a finished workout is the athlete's own rating of how hard it felt: 1–3 easy, 4–6 moderate, 7–8 hard, 9–10 all out; absent when they did not rate it; expected_effort_1_to_10 is what the planner (the AI or Claude) predicted for that workout on the same scale",
    generated_at: new Date().toISOString(),
    today,
    weekday: new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: TZ }).format(new Date()),
    person: {
      name: personName(u?.username ?? "", u?.profile),
      sex: profile.sex,
      age: ageOn(profile.birthDate, today),
      height_cm: profile.heightCm,
      training_experience: profile.experience,
      about_in_their_own_words: profile.about || null,
    },
    health: {
      // A pause in training and why: illness, injury, period, mental (fatigue, stress), travel, other.
      paused_now: profile.sick ? { since: profile.sick.since, reason: profile.sick.reason, note: profile.sick.note || undefined } : null,
      recent_pauses: profile.sickHistory.slice(-5).map((p) => ({ from: p.from, to: p.to, reason: p.reason, note: p.note || undefined })),
    },
    goals: profile.goals.map((g) => ({
      title: g.title,
      details: g.details || undefined,
      target_date: g.targetDate,
      achieved: g.done,
      ...(g.metric
        ? {
            measured_by: g.metric.kind === "exercise" ? `heaviest set of ${g.metric.name}, kg` : g.metric.kind === "measure" ? `${g.metric.key.slice(2)} measurement, cm` : "body weight, kg",
            started_at: g.start,
            now: progress[g.id]?.current ?? null,
            target: g.target,
            percent_done: progress[g.id]?.fraction != null ? Math.round(progress[g.id].fraction! * 100) : null,
          }
        : {}),
    })),
    training_programmes: programmes,
    weekly_targets: { strength_workouts: targets.workouts, cardio_minutes: targets.cardioMin, muscle_groups_trained_enough: targets.muscles },
    body: {
      weight_kg: lastWeight
        ? { latest: lastWeight.value, on: lastWeight.day, ninety_days_ago: weight.length > 1 ? weight[0].value : null, entries_in_90_days: weight.length }
        : null,
      bmi: lastWeight && profile.heightCm ? round1(lastWeight.value / (profile.heightCm / 100) ** 2) : null,
      measurements_cm: Object.fromEntries(
        MEASURES.flatMap((m) => {
          const rows = measures.filter((r) => r.metric === m.key);
          return rows.length ? [[m.key.slice(2), { latest: rows.at(-1)!.value, on: rows.at(-1)!.day, previous: rows.at(-2)?.value ?? null }]] : [];
        }),
      ),
    },
    recovery: {
      apple_health_last_4_weeks: Object.fromEntries(
        VITALS.flatMap(([metric, unit]) => {
          const rows = vitals.filter((v) => v.metric === metric);
          if (rows.length === 0) return [];
          return [[metric, { latest: round1(rows.at(-1)!.value), on: rows.at(-1)!.day, average: round1(rows.reduce((a, r) => a + r.value, 0) / rows.length), unit }]];
        }),
      ),
      what_stands_out: notableVitals(vitals, today).map((n) => ({ metric: n.metric, status: n.status, last_7_days: round1(n.recent) })),
    },
    muscle_load: {
      how_it_is_counted: muscles.counting,
      per_muscle: muscles.muscles.map((m) => ({ muscle: m.muscle, this_week: m.load_this_week, weekly_average_6_weeks: m.avg_load_per_week, last_trained: m.last_trained })),
      cardio_minutes_by_week_oldest_first: muscles.cardio_minutes_by_week,
    },
    best_sets_by_estimated_1rm: records.map((r) => ({ exercise: r.name, weight_kg: r.weight, reps: r.reps, on: r.day, new_in_last_30_days: r.isNew })),
    finished_workouts_newest_first: [...recent].sort((a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0)).map((w) => workout(w, true)),
    planned_workouts: planned.map((w) => workout(w, false)),
    apple_watch_sessions_last_3_weeks: watch.map((h) => ({
      date: dayOf(h.startAt),
      activity: h.activityType,
      minutes: Math.round((h.durationSec ?? 0) / 60),
      avg_hr: h.avgHr ? Math.round(h.avgHr) : null,
      max_hr: h.maxHr ? Math.round(h.maxHr) : null,
      active_kcal: h.activeKcal ? Math.round(h.activeKcal) : null,
      km: h.distanceM ? round1(h.distanceM / 1000) : null,
      in_diary: Boolean(h.workoutId),
    })),
  };
}

export type AthleteContext = Awaited<ReturnType<typeof getAthleteContext>>;

export { setText };
