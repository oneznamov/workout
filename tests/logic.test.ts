import { describe, expect, it } from "vitest";
import { cardioKind, hrIntensity, paceLabel } from "@/lib/cardio-kinds";
import { resolveDashboard, WIDGETS } from "@/lib/dashboard";
import { DEFAULT_GOALS, normalizeGoals } from "@/lib/goals";
import { loadColor, muscleStatus } from "@/lib/muscles";
import { activeSeconds, describeSet } from "@/lib/shape";

describe("weekly goals", () => {
  it("falls back to defaults and clamps to the allowed range", () => {
    expect(normalizeGoals(null)).toEqual(DEFAULT_GOALS);
    expect(normalizeGoals({ workouts: 99, cardioMin: 1, muscles: 4.6 })).toEqual({ workouts: 14, cardioMin: 10, muscles: 5 });
  });
});

describe("home screen layout", () => {
  it("shows the default widgets when nothing is saved", () => {
    const w = resolveDashboard(null);
    expect(w.map((x) => x.id)).toEqual(WIDGETS.map((x) => x.id));
    expect(w.find((x) => x.id === "goals")?.visible).toBe(true);
    expect(w.find((x) => x.id === "vitals")?.visible).toBe(false);
  });
  it("applies saved order and visibility, ignoring unknown ids", () => {
    const w = resolveDashboard({ order: ["weight", "nope", "goals"], hidden: ["goals"] });
    expect(w[0].id).toBe("weight");
    expect(w[1].id).toBe("goals");
    expect(w[1].visible).toBe(false);
    expect(w.length).toBe(WIDGETS.length);
  });
});

describe("muscle load", () => {
  it("maps weekly load to a status", () => {
    expect(muscleStatus(0)).toBe("none");
    expect(muscleStatus(3)).toBe("low");
    expect(muscleStatus(7)).toBe("below");
    expect(muscleStatus(12)).toBe("optimal");
    expect(muscleStatus(25)).toBe("high");
  });
  it("colours the heat scale from neutral to red", () => {
    expect(loadColor(0)).toBe("#3a3a3c");
    expect(loadColor(100)).toBe("#ff453a");
    expect(loadColor(1.5)).toMatch(/^rgb\(/);
    expect(loadColor(1.5)).not.toBe(loadColor(10));
  });
});

describe("cardio", () => {
  it("classifies watch activity names", () => {
    expect(cardioKind("Outdoor Run")).toBe("run");
    expect(cardioKind("Indoor Cycle")).toBe("cycle");
    expect(cardioKind("Outdoor Walk")).toBe("walk");
    expect(cardioKind("Functional Strength Training")).toBeNull();
    expect(cardioKind("Біг")).toBe("run");
  });
  it("formats pace for runs and speed for rides", () => {
    expect(paceLabel("run", 5000, 1500)).toBe("5:00 /км");
    expect(paceLabel("cycle", 20000, 3600)).toBe("20.0 км/год");
    expect(paceLabel("run", null, 600)).toBeNull();
  });
  it("scales effort by heart rate", () => {
    expect(hrIntensity(null, 190)).toBe(1);
    expect(hrIntensity(100, 190)).toBe(0.6);
    expect(hrIntensity(175, 190)).toBe(1.4);
  });
});

describe("workout time", () => {
  const base = { startedAt: "2026-11-12T10:00:00.000Z", endedAt: "2026-11-12T11:00:00.000Z", pausedSec: 0, pausedAt: null };
  it("subtracts finished pauses", () => {
    expect(activeSeconds(base)).toBe(3600);
    expect(activeSeconds({ ...base, pausedSec: 600 })).toBe(3000);
  });
  it("stops the active clock while paused", () => {
    const live = { ...base, endedAt: null, pausedAt: "2026-11-12T10:20:00.000Z" };
    expect(activeSeconds(live, +new Date("2026-11-12T10:30:00.000Z"))).toBe(1200);
    expect(activeSeconds(live, +new Date("2026-11-12T10:50:00.000Z"))).toBe(1200);
  });
  it("describes sets by tracking type", () => {
    const s = { weight: 80, reps: 8, durationSec: 90, distanceM: 2500 };
    expect(describeSet("weight_reps", s)).toBe("80 × 8");
    expect(describeSet("reps", { ...s, weight: null })).toBe("8 повт");
    expect(describeSet("duration", s)).toBe("1:30");
    expect(describeSet("distance", s)).toBe("2.5 км · 2 хв");
  });
});

import { rank, weekStreak, type BoardRow } from "@/lib/team-logic";

describe("friends", () => {
  it("counts weeks in a row, keeping the streak alive before this week's first workout", () => {
    // Thursday 12 Nov 2026; weeks start on Monday.
    expect(weekStreak(["2026-11-10", "2026-11-03", "2026-10-28"], "2026-11-12")).toBe(3);
    expect(weekStreak(["2026-11-03", "2026-10-28"], "2026-11-12")).toBe(2);
    expect(weekStreak(["2026-10-20"], "2026-11-12")).toBe(0);
    expect(weekStreak([], "2026-11-12")).toBe(0);
  });
  it("ranks by a metric and lets ties share a place", () => {
    const row = (name: string, workouts: number): BoardRow => ({ userId: name, name, me: false, workouts, activeMin: 0, volume: 0, sets: 0, cardioKm: 0, streak: 0 });
    const ranked = rank([row("b", 2), row("a", 3), row("c", 2), row("d", 0)], "workouts");
    expect(ranked.map((r) => [r.name, r.place])).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 2],
      ["d", 4],
    ]);
  });
});

import { extractJson, resolvePlan } from "@/lib/ai-plan";
import { seal, unseal } from "@/lib/crypto";
import { normalizeProfile, profileText } from "@/lib/profile";

describe("athlete profile", () => {
  it("keeps well-formed goals, drops empty ones and repairs ids and dates", () => {
    const p = normalizeProfile({
      about: "  3 рази на тиждень  ",
      goals: [
        { id: "a", title: " Жим 100 кг ", details: "зараз 80×5", targetDate: "2027-03-01", done: false },
        { id: "a", title: "Схуднути", target_date: "скоро" },
        { title: "   " },
        "сміття",
      ],
    });
    expect(p.about).toBe("3 рази на тиждень");
    expect(p.goals.map((g) => g.title)).toEqual(["Жим 100 кг", "Схуднути"]);
    expect(p.goals[0]).toMatchObject({ id: "a", targetDate: "2027-03-01", done: false });
    expect(p.goals[1].id).not.toBe("a");
    expect(p.goals[1].targetDate).toBeNull();
    expect(profileText(p)).toContain("Жим 100 кг (by 2027-03-01) — зараз 80×5");
    expect(normalizeProfile(null)).toEqual({ about: "", goals: [], sex: null, birthDate: null, heightCm: null, experience: null, sick: null, sickHistory: [] });
  });
  it("keeps a goal that was typed only into the details field", () => {
    const p = normalizeProfile({ goals: [{ id: "x", title: "", details: "Схуднути до 80 кг", done: false }, { id: "y", title: "", details: "" }] });
    expect(p.goals).toHaveLength(1);
    expect(p.goals[0]).toMatchObject({ id: "x", title: "Схуднути до 80 кг", details: "", targetDate: null, done: false });
  });
});

describe("AI plan", () => {
  const library = [
    { id: "1", name: "Barbell Bench Press", nameUk: "Жим лежачи", tracking: "weight_reps" },
    { id: "2", name: "Plank", nameUk: "Планка", tracking: "duration" },
    { id: "3", name: "Pull-Up", nameUk: null, tracking: "reps" },
  ];
  it("reads JSON out of a chatty reply", () => {
    expect(extractJson('Ось план:\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(() => extractJson("нічого")).toThrow();
  });
  it("matches exercises to the library, clamps numbers and drops what it cannot place", () => {
    const plan = resolvePlan(
      {
        name: " Груди ",
        notes: "бо відстають",
        exercises: [
          { exercise: "barbell bench press", rest_seconds: 5, notes: null, sets: [{ weight: 82.6, reps: 8, duration_sec: null }, { weight: 9999, reps: 500, duration_sec: null }] },
          { exercise: "Планка", rest_seconds: null, notes: " тримати спину ", sets: [{ weight: 20, reps: 10, duration_sec: 45 }] },
          { exercise: "Flying Kick", rest_seconds: 60, notes: null, sets: [{ weight: null, reps: 5, duration_sec: null }] },
          { exercise: "Pull-Up", rest_seconds: 90, notes: null, sets: [] },
        ],
      },
      library,
    );
    expect(plan.name).toBe("Груди");
    expect(plan.unknown).toEqual(["Flying Kick"]);
    expect(plan.exercises).toEqual([
      { exerciseId: "1", restSeconds: 20, notes: null, sets: [{ weight: 82.5, reps: 8, durationSec: null }, { weight: 500, reps: 100, durationSec: null }] },
      { exerciseId: "2", restSeconds: null, notes: "тримати спину", sets: [{ weight: null, reps: null, durationSec: 45 }] },
    ]);
  });
  it("skips exercises the workout already has", () => {
    const raw = { name: "x", notes: "", exercises: [{ exercise: "Plank", rest_seconds: null, notes: null, sets: [{ weight: null, reps: null, duration_sec: 30 }] }] };
    expect(resolvePlan(raw, library, ["2"]).exercises).toEqual([]);
  });
});

describe("sealed secrets", () => {
  it("round-trips and rejects tampering", () => {
    process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-1234";
    const sealed = seal("sk-test-123");
    expect(sealed).not.toContain("sk-test");
    expect(unseal(sealed)).toBe("sk-test-123");
    expect(unseal(sealed.slice(0, -2) + "xx")).toBeNull();
    expect(unseal("garbage")).toBeNull();
  });
});

import { workoutKind } from "@/lib/workout-kind";

describe("workout kind", () => {
  it("names a workout by what it trains", () => {
    expect(workoutKind(null).label).toBe("Без вправ");
    expect(workoutKind({ quads: 2, hamstrings: 1, calves: 1, core: 1 }).label).toBe("Ноги");
    expect(workoutKind({ chest: 3, triceps: 1 }).label).toBe("Груди");
    expect(workoutKind({ chest: 2, shoulders: 2, triceps: 1 }).label).toBe("Жимове");
    expect(workoutKind({ back: 2, biceps: 2, forearms: 1 }).label).toBe("Тягове");
    expect(workoutKind({ back: 3, biceps: 2 }).label).toBe("Тягове");
    expect(workoutKind({ back: 4, biceps: 1 }).label).toBe("Спина");
    expect(workoutKind({ biceps: 2, triceps: 2, shoulders: 1 }).label).toBe("Руки");
    expect(workoutKind({ chest: 2, back: 2, shoulders: 1, core: 1 }).label).toBe("Верх тіла");
    expect(workoutKind({ chest: 1, back: 2, quads: 2, core: 1, shoulders: 1 }).label).toBe("Фулбоді");
    expect(workoutKind({ core: 3, chest: 1 }).label).toBe("Прес");
    expect(workoutKind({ cardio: 2 })).toMatchObject({ label: "Кардіо", cardio: true });
  });
  it("gives every kind one fixed picture", () => {
    expect(workoutKind({ quads: 2, core: 1 }).zones).toEqual({ shoulders: false, torso: false, arms: false, core: false, legs: true });
    expect(workoutKind({ full_body: 1 }).zones).toEqual({ shoulders: true, torso: true, arms: true, core: true, legs: true });
    expect(workoutKind({ chest: 1, quads: 1 }).zones).toEqual(workoutKind({ full_body: 2 }).zones);
    expect(workoutKind({ back: 3, biceps: 2 }).zones).toEqual({ shoulders: true, torso: true, arms: true, core: false, legs: false });
    expect(workoutKind({ biceps: 2, triceps: 2 }).zones).toMatchObject({ arms: true, torso: false });
  });
});

import { resolveProgram } from "@/lib/ai-plan";

describe("AI programme", () => {
  const library = [
    { id: "1", name: "Barbell Bench Press", nameUk: null, tracking: "weight_reps" },
    { id: "2", name: "Back Squat", nameUk: null, tracking: "weight_reps" },
  ];
  const day = (date: string, exercise: string) => ({ date, name: `W ${date}`, notes: "", exercises: [{ exercise, rest_seconds: 90, notes: null, sets: [{ weight: 50, reps: 8, duration_sec: null }] }] });
  it("keeps one workout per allowed day, in date order, and drops the rest", () => {
    const program = resolveProgram(
      {
        notes: " ідея ",
        workouts: [
          day("2026-11-16", "Back Squat"),
          day("2026-11-14", "Barbell Bench Press"),
          day("2026-11-14", "Back Squat"),
          day("2026-11-20", "Back Squat"),
          day("2026-11-15", "Unknown Move"),
        ],
      },
      library,
      ["2026-11-14", "2026-11-15", "2026-11-16"],
    );
    expect(program.notes).toBe("ідея");
    expect(program.workouts.map((w) => [w.date, w.exercises[0].exerciseId])).toEqual([
      ["2026-11-14", "1"],
      ["2026-11-16", "2"],
    ]);
  });
});

import { ageOn } from "@/lib/profile";
import { notableVitals } from "@/lib/vitals";

describe("person and vitals", () => {
  it("keeps valid person fields and drops nonsense", () => {
    expect(normalizeProfile({ sex: "female", birthDate: "1994-05-20", heightCm: 168.4, experience: "advanced" })).toMatchObject({ sex: "female", birthDate: "1994-05-20", heightCm: 168, experience: "advanced" });
    expect(normalizeProfile({ sex: "x", birthDate: "94-05-20", heightCm: 20, experience: "pro" })).toMatchObject({ sex: null, birthDate: null, heightCm: null, experience: null });
  });
  it("computes full years", () => {
    expect(ageOn("1994-05-20", "2026-05-19")).toBe(31);
    expect(ageOn("1994-05-20", "2026-05-20")).toBe(32);
    expect(ageOn(null, "2026-05-20")).toBeNull();
  });
  it("flags only what stands out", () => {
    const day = (ago: number) => {
      const d = new Date("2026-11-12T12:00:00Z");
      d.setUTCDate(d.getUTCDate() - ago);
      return d.toISOString().slice(0, 10);
    };
    const series = (metric: string, recent: number, base: number) => Array.from({ length: 24 }, (_, i) => ({ metric, day: day(i), value: i < 7 ? recent : base }));
    const notes = notableVitals([...series("resting_heart_rate", 66, 58), ...series("sleep_analysis", 7.8, 7), ...series("heart_rate_variability", 50, 50), ...series("step_count", 7000, 7000)], "2026-11-12");
    expect(notes.map((n) => [n.metric, n.status])).toEqual([
      ["resting_heart_rate", "attention"],
      ["sleep_analysis", "great"],
    ]);
  });
});

import { goalFraction } from "@/lib/profile";
import { suggestWeight } from "@/lib/progression";

describe("goals and progression", () => {
  it("measures progress toward a target in either direction", () => {
    expect(goalFraction(80, 90, 100)).toBe(0.5);
    expect(goalFraction(90, 86, 82)).toBe(0.5);
    expect(goalFraction(90, 95, 82)).toBe(0);
    expect(goalFraction(80, 120, 100)).toBe(1);
    expect(goalFraction(null, 80, 100)).toBeNull();
    expect(goalFraction(80, null, 100)).toBeNull();
  });
  it("keeps a measurable goal only with a target", () => {
    const p = normalizeProfile({ goals: [{ title: "Жим 100", metric: { kind: "exercise", exerciseId: "e1", name: "Bench" }, target: 100, start: 80 }, { title: "Талія", metric: { kind: "measure", key: "m_waist" } }, { title: "Вага", metric: { kind: "nonsense" }, target: 80 }] });
    expect(p.goals.map((g) => [g.metric?.kind ?? null, g.target, g.start])).toEqual([
      ["exercise", 100, 80],
      [null, null, null],
      [null, null, null],
    ]);
  });
  it("suggests a step up only after a set that went well", () => {
    expect(suggestWeight({ weight: 60, reps: 8 }, { weight: 60, reps: 8 })).toBe(62.5);
    expect(suggestWeight({ weight: 60, reps: 8 }, { weight: 60, reps: 6 })).toBeNull();
    expect(suggestWeight({ weight: 62.5, reps: 8 }, { weight: 60, reps: 9 })).toBeNull();
    expect(suggestWeight({ weight: 12, reps: 10 }, { weight: 12, reps: 12 })).toBe(13);
    expect(suggestWeight({ weight: 60, reps: 8 }, undefined)).toBeNull();
  });
});

import { challengeProgress, normalizeChallenge } from "@/lib/team-logic";

describe("team challenge", () => {
  const row = (name: string, workouts: number, me = false): BoardRow => ({ userId: name, name, me, workouts, activeMin: 0, volume: 0, sets: 0, cardioKm: 0, streak: 0 });
  it("accepts only a known metric with a positive target", () => {
    expect(normalizeChallenge({ metric: "workouts", target: 3, mode: "team" })).toEqual({ metric: "workouts", target: 3, mode: "team" });
    expect(normalizeChallenge({ metric: "workouts", target: "4" })).toEqual({ metric: "workouts", target: 4, mode: "each" });
    expect(normalizeChallenge({ metric: "streak", target: 3 })).toBeNull();
    expect(normalizeChallenge({ metric: "sets", target: 0 })).toBeNull();
  });
  it("is done when everyone gets there, or when the team adds up to it", () => {
    const rows = [row("a", 3), row("b", 1)];
    expect(challengeProgress({ metric: "workouts", target: 3, mode: "each" }, rows)).toMatchObject({ total: 4, done: false });
    expect(challengeProgress({ metric: "workouts", target: 4, mode: "team" }, rows)).toMatchObject({ total: 4, done: true });
    expect(challengeProgress({ metric: "workouts", target: 1, mode: "each" }, rows).done).toBe(true);
  });
});

import { sickWeeks } from "@/lib/profile";

describe("illness mode", () => {
  it("lists the weeks an illness touched", () => {
    const weeks = sickWeeks({ sick: { since: "2026-11-11", note: "" }, sickHistory: [{ from: "2026-10-22", to: "2026-10-27" }] }, "2026-11-12");
    expect([...weeks].sort()).toEqual(["2026-10-19", "2026-10-26", "2026-11-09"]);
  });
  it("does not let a sick week break the streak", () => {
    // Trained in the weeks of 26 Oct and 9 Nov; the week of 2 Nov was spent ill.
    expect(weekStreak(["2026-11-10", "2026-10-28"], "2026-11-12")).toBe(1);
    expect(weekStreak(["2026-11-10", "2026-10-28"], "2026-11-12", new Set(["2026-11-02"]))).toBe(2);
    expect(weekStreak(["2026-10-28"], "2026-11-12", new Set(["2026-11-02", "2026-11-09"]))).toBe(1);
  });
});

import { programStatus, programWeek, programWeeks } from "@/lib/program-logic";

describe("programmes", () => {
  it("knows where a programme stands and which week a day is", () => {
    const p = { startsOn: "2026-11-09", endsOn: "2026-12-06" };
    expect(programStatus(p, "2026-11-08")).toBe("upcoming");
    expect(programStatus(p, "2026-11-12")).toBe("active");
    expect(programStatus(p, "2026-12-07")).toBe("finished");
    expect(programWeek(p.startsOn, "2026-11-09")).toBe(1);
    expect(programWeek(p.startsOn, "2026-11-16")).toBe(2);
    expect(programWeeks(p)).toBe(4);
  });
  it("carries the programme name and forecast and tolerates their absence", () => {
    const library = [{ id: "1", name: "Back Squat", nameUk: null, tracking: "weight_reps" }];
    const w = { date: "2026-11-14", name: "A", notes: "", exercises: [{ exercise: "Back Squat", rest_seconds: 90, notes: null, sets: [{ weight: 50, reps: 8, duration_sec: null }] }] };
    expect(resolveProgram({ name: " Вступна ", notes: "ідея", forecast: "присід 60×8", workouts: [w] }, library, ["2026-11-14"])).toMatchObject({ name: "Вступна", forecast: "присід 60×8" });
    expect(resolveProgram({ workouts: [w] }, library, ["2026-11-14"])).toMatchObject({ name: "", forecast: "", notes: "" });
  });
});
