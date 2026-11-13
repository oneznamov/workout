/**
 * Fills an EMPTY database with a made-up athlete and five months of training, so the app can be
 * shown without anyone's real data (the GitHub Pages demo, screenshots, trying it out locally).
 *
 *   DEMO_DATABASE_URL=postgres://… pnpm demo:seed
 *
 * It deliberately ignores DATABASE_URL and refuses to touch a database that already has users.
 * Everything is generated relative to today, from a fixed random seed.
 */
import bcrypt from "bcryptjs";
import postgres from "postgres";
import { slugify } from "../src/db/exercise-data";

const url = process.env.DEMO_DATABASE_URL;
if (!url) {
  console.error("DEMO_DATABASE_URL is not set. Point it at a throwaway database — never at your real one.");
  process.exit(1);
}

export const DEMO_LOGIN = "demo";
export const DEMO_PASSWORD = "demo-demo";
const TZ = process.env.NEXT_PUBLIC_APP_TZ ?? "Europe/Kyiv";
const WEEKS = 20;

// ── Small deterministic helpers ──
let seed = 20240917;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const between = (lo: number, hi: number) => lo + rnd() * (hi - lo);
const int = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
const round = (v: number, step: number) => Math.round(v / step) * step;
const r1 = (v: number) => Math.round(v * 10) / 10;

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const today = dayFmt.format(new Date());
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dow = (day: string) => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
const monday = addDays(today, -dow(today));
/** A moment on `day` at local wall-clock time in the app time zone. */
function at(day: string, hour: number, minute = 0) {
  const guess = new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  const shown = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(guess);
  const [h, m] = shown.split(":").map(Number);
  let diff = h * 60 + m - (hour * 60 + minute);
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;
  return new Date(guess.getTime() - diff * 60000);
}

// ── The plan the athlete follows ──
type Lift = { name: string; start: number; gain: number; reps: number; sets: number; step?: number; rest?: number };
type Session = { name: string; effort: number; lifts: Lift[] };
const SPLIT: Record<"push" | "pull" | "legs" | "upper", Session> = {
  push: {
    name: "Груди, плечі, трицепс",
    effort: 7,
    lifts: [
      { name: "Barbell Bench Press", start: 72.5, gain: 1.05, reps: 6, sets: 4, rest: 150 },
      { name: "Incline Dumbbell Press", start: 24, gain: 0.35, reps: 9, sets: 3, step: 2 },
      { name: "Overhead Press", start: 42.5, gain: 0.55, reps: 7, sets: 3, rest: 120 },
      { name: "Dumbbell Lateral Raise", start: 9, gain: 0.15, reps: 13, sets: 3, step: 1 },
      { name: "Cable Crossover", start: 17.5, gain: 0.25, reps: 12, sets: 3 },
      { name: "Triceps Pushdown", start: 27.5, gain: 0.45, reps: 11, sets: 3 },
    ],
  },
  pull: {
    name: "Спина й біцепс",
    effort: 7,
    lifts: [
      { name: "Deadlift", start: 110, gain: 1.6, reps: 5, sets: 3, rest: 180 },
      { name: "Lat Pulldown", start: 57.5, gain: 0.6, reps: 10, sets: 3 },
      { name: "Barbell Row", start: 60, gain: 0.7, reps: 8, sets: 3, rest: 120 },
      { name: "Seated Cable Row", start: 55, gain: 0.5, reps: 11, sets: 3 },
      { name: "Face Pull", start: 20, gain: 0.3, reps: 14, sets: 3 },
      { name: "Barbell Curl", start: 30, gain: 0.3, reps: 10, sets: 3 },
    ],
  },
  legs: {
    name: "Ноги",
    effort: 8,
    lifts: [
      { name: "Back Squat", start: 90, gain: 1.5, reps: 6, sets: 4, rest: 180 },
      { name: "Romanian Deadlift", start: 80, gain: 1.0, reps: 8, sets: 3, rest: 120 },
      { name: "Leg Press", start: 160, gain: 2.5, reps: 10, sets: 3, step: 5 },
      { name: "Lying Leg Curl", start: 40, gain: 0.5, reps: 12, sets: 3 },
      { name: "Standing Calf Raise", start: 60, gain: 0.8, reps: 14, sets: 3 },
      { name: "Plank", start: 0, gain: 0, reps: 0, sets: 3 },
    ],
  },
  upper: {
    name: "Верх тіла",
    effort: 6,
    lifts: [
      { name: "Dumbbell Bench Press", start: 28, gain: 0.4, reps: 9, sets: 3, step: 2 },
      { name: "Pull-Up", start: 0, gain: 0, reps: 8, sets: 4 },
      { name: "Seated Dumbbell Shoulder Press", start: 20, gain: 0.3, reps: 9, sets: 3, step: 2 },
      { name: "Dumbbell Row", start: 30, gain: 0.4, reps: 10, sets: 3, step: 2 },
      { name: "Hammer Curl", start: 14, gain: 0.2, reps: 11, sets: 3, step: 2 },
      { name: "Hanging Leg Raise", start: 0, gain: 0, reps: 12, sets: 3 },
    ],
  },
};
/** Week pattern by weekday (0 = Monday). */
const WEEK_PLAN: [number, keyof typeof SPLIT][] = [
  [0, "push"],
  [2, "pull"],
  [4, "legs"],
  [5, "upper"],
];
/** Weeks ago that were lost to a cold. */
const SICK_WEEK = 9;

async function main() {
  const sql = postgres(url!, { max: 1, prepare: false, onnotice: () => undefined });
  const [{ n }] = await sql`select count(*)::int as n from users`;
  if (n > 0) {
    console.error("This database already has users — the demo seed only fills an empty one.");
    await sql.end();
    process.exit(1);
  }

  const library = await sql<{ id: string; slug: string; name: string; tracking: string }[]>`select id, slug, name, tracking from exercises where user_id is null`;
  if (library.length === 0) throw new Error("The exercise library is empty — run `pnpm db:setup` against this database first.");
  const bySlug = new Map(library.map((e) => [e.slug, e]));
  const ex = (name: string) => {
    const e = bySlug.get(slugify(name));
    if (!e) throw new Error(`No such exercise in the library: ${name}`);
    return e;
  };
  for (const s of Object.values(SPLIT)) s.lifts.forEach((l) => ex(l.name));

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const person = async (username: string, profile: object, extra: { admin?: boolean; goals?: object; ai?: object } = {}) => {
    const [u] = await sql`
      insert into users (username, password_hash, is_admin, profile, goals, ai, created_at)
      values (${username}, ${hash}, ${extra.admin ?? false}, ${sql.json(profile as never)}, ${extra.goals ? sql.json(extra.goals as never) : null},
              ${extra.ai ? sql.json(extra.ai as never) : null}, ${at(addDays(monday, -WEEKS * 7), 9)})
      returning id`;
    return u.id as string;
  };
  const base = { photoAt: null, about: "", goals: [], sex: null, birthDate: null, heightCm: null, experience: null, sick: null, sickHistory: [] };

  const bench = ex("Barbell Bench Press");
  const squat = ex("Back Squat");
  const sickFrom = addDays(monday, -SICK_WEEK * 7 + 1);
  const me = await person(
    DEMO_LOGIN,
    {
      ...base,
      name: "Алекс",
      about: "Офісна робота, треную зранку перед роботою. Старе розтягнення лівого плеча — обережно з жимами над головою. Мета — сила в базових вправах і мінус кілька кілограмів до літа.",
      sex: "male",
      birthDate: "1992-05-14",
      heightCm: 181,
      experience: "intermediate",
      sickHistory: [{ from: sickFrom, to: addDays(sickFrom, 5), reason: "illness", note: "Застуда" }],
      goals: [
        { id: "g-bench", title: "Жим лежачи 100 кг", details: "Хоча б один чистий повтор", targetDate: addDays(today, 60), done: false, metric: { kind: "exercise", exerciseId: bench.id, name: "Жим штанги лежачи" }, target: 100, start: 72.5 },
        { id: "g-weight", title: "Вага 80 кг", details: "Без втрати сили", targetDate: addDays(today, 45), done: false, metric: { kind: "body_mass" }, target: 80, start: 86.4 },
        { id: "g-squat", title: "Присід 130 кг", details: "", targetDate: addDays(today, 90), done: false, metric: { kind: "exercise", exerciseId: squat.id, name: "Присідання зі штангою" }, target: 130, start: 90 },
        { id: "g-waist", title: "Талія 84 см", details: "", targetDate: null, done: false, metric: { kind: "measure", key: "m_waist" }, target: 84, start: 91 },
      ],
    },
    {
      admin: true,
      goals: { workouts: 4, cardioMin: 120, muscles: 9 },
      // Looks connected so the AI cards are visible; the key is not a real one.
      ai: { provider: "anthropic", model: "claude-opus-5-5", key: "demo", hint: "…demo", auto: false },
    },
  );
  const mates = [
    { id: await person("ira", { ...base, name: "Іра", sex: "female" }), perWeek: 3, kg: 0.55, run: 9 },
    { id: await person("maks", { ...base, name: "Макс", sex: "male" }), perWeek: 5, kg: 1.2, run: 0 },
    { id: await person("dana", { ...base, name: "Дана", sex: "female" }), perWeek: 2, kg: 0.5, run: 22 },
  ];

  const [team] = await sql`
    insert into teams (name, challenge) values ('Ранкова зміна', ${sql.json({ metric: "workouts", target: 3, mode: "each" })}) returning id`;
  await sql`insert into team_members (team_id, user_id, joined_at) values (${team.id}, ${me}, ${at(addDays(monday, -70), 9)})`;
  for (const [i, m] of mates.entries()) await sql`insert into team_members (team_id, user_id, joined_at) values (${team.id}, ${m.id}, ${at(addDays(monday, -60 + i * 9), 10)})`;

  // ── Programme ──
  const progStart = addDays(monday, -35);
  const progEnd = addDays(monday, 20);
  const [program] = await sql`
    insert into programs (user_id, name, description, forecast, starts_on, ends_on, created_at)
    values (${me}, 'Сила в базі · 8 тижнів',
            'Чотири тренування на тиждень: жим, тяга, ноги і легший день на верх. Базові вправи — у діапазоні 5–8 повторень із додаванням ваги щотижня; на шостому тижні розвантаження.',
            'Жим лежачи 95 кг × 5, присід 120 кг × 5, станова 140 кг × 5. Вага тіла — близько 81 кг.',
            ${progStart}, ${progEnd}, ${at(addDays(progStart, -2), 20)})
    returning id`;

  type Planned = { name: string; exercises: string[] };
  const insertWorkout = async (
    userId: string,
    session: Session,
    opts: { status: "completed" | "planned" | "template"; day?: string; week: number; hour?: number; program?: boolean; watch?: boolean; light?: boolean },
  ) => {
    const done = opts.status === "completed";
    const start = done ? at(opts.day!, opts.hour ?? 7, int(5, 40)) : null;
    const [w] = await sql`
      insert into workouts (user_id, program_id, name, status, scheduled_for, started_at, expected_effort, created_at)
      values (${userId}, ${opts.program ? program.id : null}, ${session.name}, ${opts.status},
              ${opts.status === "planned" ? opts.day! : null}, ${start}, ${opts.status === "template" ? null : session.effort},
              ${done ? start : new Date()})
      returning id`;
    let clock = start ? start.getTime() + 4 * 60000 : 0;
    const marks: number[] = [];
    let volume = 0;
    for (const [pos, lift] of session.lifts.entries()) {
      const e = ex(lift.name);
      const rest = lift.rest ?? 90;
      const [we] = await sql`
        insert into workout_exercises (workout_id, exercise_id, position, rest_seconds) values (${w.id}, ${e.id}, ${pos}, ${rest}) returning id`;
      const step = lift.step ?? 2.5;
      const top = lift.start ? round((lift.start + lift.gain * opts.week) * (opts.light ? 0.9 : 1), step) : null;
      const rows = [];
      // One warm-up set before the first heavy lift.
      const warm = pos === 0 && top ? 1 : 0;
      for (let i = 0; i < lift.sets + warm; i++) {
        const isWarm = i < warm;
        let weight: number | null = top;
        let reps: number | null = lift.reps || null;
        let durationSec: number | null = null;
        if (e.tracking === "duration") {
          weight = null;
          reps = null;
          durationSec = 45 + Math.min(45, opts.week * 3) + (done ? int(-5, 5) : 0);
        } else if (e.tracking === "reps") {
          weight = null;
          reps = (lift.reps || 8) + Math.floor(opts.week / 5) - (done && i >= 2 ? int(0, 2) : 0);
        } else if (isWarm) {
          weight = round(top! * 0.6, step);
          reps = 8;
        } else if (done) {
          // The last sets sometimes come up a rep or two short.
          reps = lift.reps + (i - warm === 0 && rnd() < 0.35 ? 1 : 0) - (i - warm >= 2 && rnd() < 0.45 ? int(1, 2) : 0);
        }
        let completedAt: Date | null = null;
        if (done) {
          const work = durationSec ?? int(28, 55);
          clock += work * 1000;
          completedAt = new Date(clock);
          marks.push(clock);
          clock += (rest + int(-15, 40)) * 1000;
          if (weight && reps && !isWarm) volume += weight * reps;
        }
        rows.push({
          workout_exercise_id: we.id,
          position: i,
          type: isWarm ? "warmup" : "normal",
          weight,
          reps,
          duration_sec: durationSec,
          rpe: done && !isWarm && i - warm === lift.sets - 1 && pos < 3 ? pick([8, 8.5, 9]) : null,
          completed: done,
          completed_at: completedAt,
        });
      }
      await sql`insert into sets ${sql(rows)}`;
      if (done) clock += int(60, 150) * 1000;
    }
    if (done) {
      const end = new Date(clock);
      const effort = Math.max(4, Math.min(10, session.effort + pick([-1, 0, 0, 0, 1]) - (opts.light ? 1 : 0)));
      await sql`update workouts set ended_at = ${end}, effort = ${effort}, updated_at = ${end} where id = ${w.id}`;
      if (opts.watch) await watchRecord(userId, "Traditional Strength Training", start!, end, { marks, workoutId: w.id });
    }
    return { id: w.id as string, start, volume };
  };

  /** An Apple Watch record with a heart-rate curve: peaks at the sets for strength, a plateau for cardio. */
  const watchRecord = async (
    userId: string,
    type: string,
    start: Date,
    end: Date,
    o: { marks?: number[]; workoutId?: string; distanceM?: number; steady?: number } = {},
  ) => {
    const samples: { t: string; bpm: number }[] = [];
    let bpm = o.steady ? 92 : 84;
    for (let t = start.getTime(); t <= end.getTime(); t += 15000) {
      let target: number;
      if (o.steady) {
        const into = (t - start.getTime()) / 60000;
        target = Math.min(o.steady, 95 + into * 14) + Math.sin(into / 3) * 4;
      } else {
        const near = (o.marks ?? []).reduce((best, m) => Math.min(best, Math.abs(t - (m - 15000))), Infinity);
        target = near < 40000 ? 142 + rnd() * 14 : 98 + rnd() * 8;
      }
      bpm += (target - bpm) * 0.45 + (rnd() - 0.5) * 3;
      samples.push({ t: new Date(t).toISOString(), bpm: Math.round(bpm) });
    }
    const bpms = samples.map((s) => s.bpm);
    const durationSec = Math.round((end.getTime() - start.getTime()) / 1000);
    const avg = bpms.reduce((a, b) => a + b, 0) / bpms.length;
    const kcal = Math.round((durationSec / 60) * (o.steady ? 10.5 : 6.2) * (avg / 130));
    await sql`
      insert into health_workouts (user_id, external_id, activity_type, start_at, end_at, duration_sec, active_kcal, total_kcal, avg_hr, max_hr, min_hr, distance_m, hr_samples, workout_id)
      values (${userId}, ${`demo:${userId}:${start.toISOString()}`}, ${type}, ${start}, ${end}, ${durationSec}, ${kcal}, ${Math.round(kcal * 1.22)},
              ${Math.round(avg)}, ${Math.max(...bpms)}, ${Math.min(...bpms)}, ${o.distanceM ?? null}, ${sql.json(samples)}, ${o.workoutId ?? null})`;
  };

  // ── The athlete's own history ──
  const finished: { id: string; day: string; key: string; volume: number }[] = [];
  const plannedSnapshot: Planned[] = [];
  for (let weeksAgo = WEEKS; weeksAgo >= -3; weeksAgo--) {
    const week = WEEKS - weeksAgo;
    const weekMonday = addDays(monday, -weeksAgo * 7);
    const inProgram = weekMonday >= progStart && weekMonday <= progEnd;
    const deload = inProgram && weeksAgo === 0 ? false : week % 7 === 6;
    for (const [weekday, key] of WEEK_PLAN) {
      const day = addDays(weekMonday, weekday);
      const session = SPLIT[key];
      if (day < today) {
        if (weeksAgo === SICK_WEEK) continue;
        // Life happens: now and then a session is skipped (never in the last fortnight — the streak looks alive).
        if (weeksAgo > 2 && rnd() < (key === "upper" ? 0.3 : 0.08)) continue;
        const w = await insertWorkout(me, session, { status: "completed", day, week, hour: weekday === 5 ? 10 : 7, program: inProgram, watch: true, light: deload });
        finished.push({ id: w.id, day, key, volume: w.volume });
      } else if (inProgram) {
        await insertWorkout(me, session, { status: "planned", day, week, program: true });
        plannedSnapshot.push({ name: session.name, exercises: session.lifts.map((l) => l.name) });
      }
    }

    // Cardio: a run midweek, a longer one or a ride at the weekend, an evening walk now and then.
    if (weeksAgo >= 0 && weeksAgo !== SICK_WEEK) {
      const cardio: [number, string, number, number, number][] = [
        [1, "Running", 19, between(4.6, 6.4), 152],
        [6, weeksAgo % 3 === 0 ? "Cycling" : "Running", 9, weeksAgo % 3 === 0 ? between(24, 38) : between(7.5, 10.5), weeksAgo % 3 === 0 ? 138 : 149],
        [3, "Walking", 20, between(2.8, 4.5), 104],
      ];
      for (const [weekday, type, hour, km, hr] of cardio) {
        const day = addDays(weekMonday, weekday);
        if (day >= today || (type === "Walking" && rnd() < 0.5)) continue;
        const pace = type === "Cycling" ? 60 / between(23, 27) : type === "Walking" ? between(10.5, 12) : between(5.35, 6.1) - week * 0.012;
        const start = at(day, hour, int(0, 45));
        await watchRecord(me, type, start, new Date(start.getTime() + km * pace * 60000), { distanceM: Math.round(km * 1000), steady: hr });
      }
    }
  }

  // Templates to start a workout from.
  for (const key of ["push", "pull", "legs"] as const) await insertWorkout(me, SPLIT[key], { status: "template", week: WEEKS });

  // ── Daily numbers from the watch and the scales ──
  const metrics: { user_id: string; metric: string; day: string; value: number; unit: string | null; source: string }[] = [];
  const put = (metric: string, day: string, value: number, unit: string | null, source = "apple_health") => metrics.push({ user_id: me, metric, day, value, unit, source });
  const DAYS = WEEKS * 7 + dow(today);
  const trained = new Set(finished.map((f) => f.day));
  for (let ago = DAYS; ago >= 0; ago--) {
    const day = addDays(today, -ago);
    const p = 1 - ago / DAYS; // 0 at the start → 1 today
    const sick = day >= sickFrom && day <= addDays(sickFrom, 5);
    if (ago % 2 === 0 || ago < 10) put("body_mass", day, r1(86.4 - 4.9 * p + (rnd() - 0.5) * 0.7), "кг", ago % 3 === 0 ? "manual" : "apple_health");
    if (ago % 7 === 0) put("body_fat_percentage", day, r1(21.8 - 3.6 * p + (rnd() - 0.5) * 0.4), "%");
    if (ago % 7 === 0) put("vo2_max", day, r1(41.2 + 3.4 * p + (rnd() - 0.5) * 0.3), "мл/кг/хв");
    put("resting_heart_rate", day, Math.round(61 - 6 * p + (sick ? 7 : 0) + (rnd() - 0.5) * 4), "уд/хв");
    put("heart_rate_variability", day, Math.round(48 + 14 * p - (sick ? 14 : 0) + (rnd() - 0.5) * 12), "мс");
    // Last night was a short one — the home screen shows how the app reacts to it.
    put("sleep_analysis", day, ago === 0 ? 5.6 : r1(7.3 + (dow(day) >= 5 ? 0.6 : 0) + (rnd() - 0.5) * 1.3 - (sick ? 0.4 : 0)), "год");
    put("step_count", day, Math.round((sick ? 3200 : 7600) + (trained.has(day) ? 2100 : 0) + rnd() * 4200), "");
    put("active_energy", day, Math.round((sick ? 240 : 430) + (trained.has(day) ? 310 : 0) + rnd() * 160), "ккал");
    put("apple_exercise_time", day, Math.round((trained.has(day) ? 68 : 18) + rnd() * 22), "хв");
    put("respiratory_rate", day, r1(14.6 + (sick ? 1.6 : 0) + (rnd() - 0.5) * 0.8), "/хв");
    put("blood_oxygen_saturation", day, Math.round(97 + (rnd() - 0.5) * 2), "%");
  }
  const tape: [string, number, number][] = [["m_waist", 91, 86.5], ["m_chest", 104, 106.5], ["m_hips", 101, 99], ["m_biceps", 36.5, 38], ["m_thigh", 58, 59.5]];
  for (let ago = DAYS; ago >= 0; ago -= 28) for (const [key, from, to] of tape) put(key, addDays(today, -ago), r1(from + (to - from) * (1 - ago / DAYS)), "см", "manual");
  for (let i = 0; i < metrics.length; i += 500) await sql`insert into health_metrics ${sql(metrics.slice(i, i + 500))}`;

  // ── Teammates: lighter histories, enough for the leaderboard and the feed ──
  const mateSession = (kg: number): Session => ({
    name: pick(["Все тіло", "Верх тіла", "Ноги й сідниці", "Спина й руки"]),
    effort: 6,
    lifts: pick([SPLIT.upper.lifts, SPLIT.legs.lifts, SPLIT.pull.lifts]).slice(0, 4).map((l) => ({ ...l, start: l.start * kg, gain: l.gain * kg })),
  });
  for (const m of mates) {
    for (let weeksAgo = 7; weeksAgo >= 0; weeksAgo--) {
      const days = [0, 1, 2, 3, 4, 5, 6].sort(() => rnd() - 0.5).slice(0, m.perWeek).sort();
      for (const d of days) {
        const day = addDays(monday, -weeksAgo * 7 + d);
        if (day >= today) continue;
        await insertWorkout(m.id, mateSession(m.kg), { status: "completed", day, week: 12 - weeksAgo, hour: pick([7, 8, 18, 19]) });
      }
      if (m.run) {
        const day = addDays(monday, -weeksAgo * 7 + 6);
        if (day < today) {
          const start = at(day, 9, int(0, 30));
          const km = m.run * between(0.4, 0.6);
          await watchRecord(m.id, "Running", start, new Date(start.getTime() + km * 5.8 * 60000), { distanceM: Math.round(km * 1000), steady: 150 });
        }
      }
    }
  }
  const recent = finished.slice(-6);
  for (const [i, f] of recent.entries())
    for (const [j, m] of mates.entries()) if ((i + j) % 2 === 0) await sql`insert into workout_reactions (workout_id, user_id, emoji) values (${f.id}, ${m.id}, ${["💪", "🔥", "👏"][(i + j) % 3]})`;

  // ── How the programme changed ──
  const snapshot = (note: string) => ({ name: "Сила в базі · 8 тижнів", description: note, forecast: "", startsOn: progStart, endsOn: progEnd, workouts: plannedSnapshot.map((p) => ({ date: null, name: p.name, status: "planned", exercises: p.exercises })) });
  await sql`insert into program_revisions (program_id, source, summary, snapshot, created_at) values
    (${program.id}, 'ai', 'Склав програму: чотири дні на тиждень, прогресія ваги в базових вправах.', ${sql.json(snapshot("Перша версія"))}, ${at(addDays(progStart, -2), 20)}),
    (${program.id}, 'manual', 'Переніс день ніг із четверга на пʼятницю.', ${sql.json(snapshot("Ноги в пʼятницю"))}, ${at(addDays(progStart, 6), 21)}),
    (${program.id}, 'claude', 'Після застуди: тиждень із меншими вагами, жим над головою замінено на гантелі через плече.', ${sql.json(snapshot("Мʼякше повернення"))}, ${at(addDays(progStart, 15), 8)})`;

  // ── What the AI coach wrote ──
  const MODEL = "claude-opus-5-5";
  const note = (kind: string, ref: string, content: string, when = new Date()) =>
    sql`insert into ai_notes (user_id, kind, ref, content, model, created_at) values (${me}, ${kind}, ${ref}, ${content}, ${MODEL}, ${when})`;
  await note(
    "coach",
    today,
    "Тиждень іде за планом: жим і тяга вже зроблені, попереду ноги й легший день на верх. Цієї ночі ви спали 5,6 год проти звичних 7,4 — у присіданнях сьогодні залиште вагу минулого тижня і зніміть один підхід, а не женіться за рекордом.\n\nВідстають литки та задні дельти: додайте підйоми на носки після жиму ногами і тягу до обличчя в кінці наступного тренування спини.\n\nДо мети «жим 100 кг» лишилося близько 7,5 кг — за нинішнього темпу (+1 кг на тиждень) це реально за 7–8 тижнів. Вага тіла йде до 80 кг із запасом, тож калорії різати далі не варто.",
  );
  const lastOf = (key: string) => [...finished].reverse().find((f) => f.key === key);
  const reviews: Record<string, string> = {
    push: "Жим лежачи: чотири робочі підходи з вагою на 2,5 кг більшою, ніж минулого разу, і без втрати повторень — найкраще тренування жиму за програму. Жим над головою зупинився: останні два підходи на повтор коротші, тут вага поки лишається.\n\nПульс піднімався до 150–155 на важких підходах і встигав опуститися нижче 105 за відпочинок — відновлення між підходами добре, паузи по 2,5 хв на жимі виправдані.\n\nНаступного разу: додайте 2,5 кг у жимі лежачи лише на перші два підходи, а розведення в сторони зробіть із паузою вгорі.",
    pull: "Станова тяга пішла вгору на 2,5 кг, усі три підходи по 5 — техніка, судячи з рівного відпочинку, не просіла. Тяга штанги в нахилі на тому ж рівні третій тиждень: спробуйте змінити хват або діапазон на 6 повторень.\n\nСередній пульс 118 — тренування вийшло спокійнішим за минуле, паузи між підходами в середньому 2 хв 05 с. Для тяги нижнього блока можна скоротити до 75 с.\n\nДалі: станову лишайте в цьому ж темпі, а біцепс винесіть раніше — наприкінці на нього вже не лишається сил.",
    legs: "Присідання: +2,5 кг до минулого тижня, але четвертий підхід — 4 повторення замість 6. Це нормальна ціна за нову вагу; наступного разу закріпіть її, не додаючи.\n\nЖим ногами й румунська тяга стабільні. Пульс на присіданнях доходив до 158 — це ваш верх за місяць, а відпочинок 3 хв ледь повертав його до 110. Після короткої ночі таке тренування коштує дорожче.\n\nПорада: розвантажте наступний день і додайте 10 хв ходьби для відновлення.",
  };
  for (const [key, text] of Object.entries(reviews)) {
    const w = lastOf(key);
    if (w) await note("workout", w.id, text, at(w.day, 9));
  }
  await note(
    "report",
    "12w",
    "Загальна картина: за 12 тижнів — 41 силове тренування і один пропущений через застуду тиждень. Тоннаж виріс приблизно на третину, і росте він за рахунок ваги на штанзі, а не кількості підходів.\n\nПрогрес у вправах: жим лежачи 80 → 92,5 кг на 6, присід 105 → 120 кг, станова тяга 127,5 → 142,5 кг на 5. Жим над головою майже не змінився — це найслабша ланка.\n\nБаланс навантаження: груди, спина і квадрицепси стабільно в нормі. Литки, задні дельти та кор недобирають до тижневого мінімуму в більшості тижнів.\n\nСерце й відновлення: пульс спокою знизився з 59 до 55 уд/хв, HRV підросла, VO₂ max +2. Після хвороби показники повернулися за 8–9 днів.\n\nЦілі: вага тіла 81,6 кг — до 80 лишилося небагато; жим 100 кг досяжний за два місяці; талія зменшилася на 4,5 см.\n\nЩо змінити: додати другий підхід на литки двічі на тиждень; замінити жим штанги над головою на гантелі на місяць; тримати сон не нижче 7 годин у дні перед ногами.",
    at(addDays(today, -1), 21),
  );

  // A token and an invite, so Settings and Admin are not empty.
  await sql`insert into api_tokens (user_id, name, token_hash, prefix, last_used_at) values
    (${me}, 'Claude', ${"demo-claude"}, 'wk_dEmo', ${at(addDays(today, -1), 22)}),
    (${me}, 'Apple Health', ${"demo-health"}, 'wk_hEal', ${at(today, 6)})`;

  await sql.end();
  console.log(`✓ Demo data is in: ${finished.length} workouts of «${DEMO_LOGIN}» (password «${DEMO_PASSWORD}»), ${mates.length} teammates, ${metrics.length} daily metrics`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
