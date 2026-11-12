import { describe, expect, it } from "vitest";
import type { CWorkout } from "@/lib/shape";
import { buildTimeline } from "@/lib/timeline";

const START = +new Date("2026-11-12T10:00:00.000Z");
const iso = (sec: number) => new Date(START + sec * 1000).toISOString();

function workout(setEnds: (number | null)[], hr?: { t: string; bpm: number }[]): CWorkout {
  return {
    id: "w",
    name: "Test",
    status: "completed",
    scheduledFor: null,
    startedAt: iso(0),
    endedAt: iso(1800),
    pausedSec: 0,
    pausedAt: null,
    notes: null,
    effort: null,
    updatedAt: iso(1800),
    exercises: [
      {
        id: "e1",
        exercise: { id: "x", name: "Back Squat", nameUk: null, muscle: "quads", equipment: "barbell", tracking: "weight_reps" },
        restSeconds: null,
        notes: null,
        sets: setEnds.map((end, i) => ({
          id: `s${i}`,
          type: "normal" as const,
          weight: 100,
          reps: 5,
          durationSec: null,
          distanceM: null,
          completed: true,
          completedAt: end == null ? null : iso(end),
        })),
      },
    ],
    health: hr
      ? [{ id: "h", activityType: "Traditional Strength Training", startAt: iso(0), endAt: iso(1800), durationSec: 1800, activeKcal: 200, totalKcal: null, avgHr: 120, maxHr: 150, minHr: 100, hrSamples: hr }]
      : [],
  };
}

describe("workout timeline", () => {
  it("uses the times sets were ticked off when tracked live", () => {
    const tl = buildTimeline(workout([300, 600, 900]))!;
    expect(tl.mode).toBe("logged");
    expect(tl.confidence).toBe("high");
    expect(tl.sets).toHaveLength(3);
    expect(tl.sets[0].restBeforeSec).toBeNull();
    // 300 s between ticks minus the ~20 s the set itself takes.
    expect(tl.sets[1].restBeforeSec).toBe(280);
    expect(tl.avgRestSec).toBe(280);
  });

  it("estimates set times from heart-rate peaks when logged afterwards", () => {
    const centers = [300, 750, 1200];
    const hr = Array.from({ length: 360 }, (_, i) => {
      const s = i * 5;
      const bump = centers.reduce((a, c) => a + 40 * Math.exp(-(((s - c) / 28) ** 2)), 0);
      return { t: iso(s), bpm: Math.round(100 + bump) };
    });
    const tl = buildTimeline(workout([null, null, null], hr))!;
    expect(tl.mode).toBe("estimated");
    expect(tl.sets).toHaveLength(3);
    // Each estimated set end lands near its heart-rate peak.
    tl.sets.forEach((s, i) => {
      const end = (+new Date(s.end) - START) / 1000;
      expect(Math.abs(end - centers[i])).toBeLessThan(40);
    });
    expect(tl.zones?.reduce((a, z) => a + z.sec, 0)).toBeGreaterThan(1700);
  });

  it("returns nothing without set times or heart rate", () => {
    expect(buildTimeline(workout([null, null]))).toBeNull();
  });
});
