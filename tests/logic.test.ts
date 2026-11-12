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
