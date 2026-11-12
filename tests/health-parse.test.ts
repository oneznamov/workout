import { describe, expect, it } from "vitest";
import { parseDate, parseHealthPayload } from "@/lib/health-parse";

describe("Apple Health payloads", () => {
  it("parses Health Auto Export dates with a numeric offset", () => {
    expect(parseDate("2026-01-15 07:30:00 +0200")?.toISOString()).toBe("2026-01-15T05:30:00.000Z");
    expect(parseDate("2026-01-15T07:30:00Z")?.toISOString()).toBe("2026-01-15T07:30:00.000Z");
    expect(parseDate("nonsense")).toBeNull();
  });

  it("aggregates metrics per day and converts units", () => {
    const { metrics } = parseHealthPayload({
      data: {
        metrics: [
          { name: "step_count", units: "count", data: [{ date: "2026-11-12 09:00:00 +0200", qty: 4000 }, { date: "2026-11-12 18:00:00 +0200", qty: 3500 }] },
          { name: "weight_body_mass", units: "lb", data: [{ date: "2026-11-12 08:00:00 +0200", qty: 180 }] },
          { name: "active_energy", units: "kJ", data: [{ date: "2026-11-12 08:00:00 +0200", qty: 4184 }] },
          { name: "sleep_analysis", units: "hr", data: [{ date: "2026-11-12 07:00:00 +0200", core: 4, rem: 1.5, deep: 1, awake: 0.3 }] },
        ],
      },
    });
    const get = (m: string) => metrics.find((x) => x.metric === m);
    expect(get("step_count")).toMatchObject({ day: "2026-11-12", value: 7500 });
    expect(get("body_mass")?.value).toBeCloseTo(81.65, 1);
    expect(get("active_energy")?.value).toBeCloseTo(1000, 0);
    expect(get("sleep_analysis")?.value).toBeCloseTo(6.5, 5);
  });

  it("reads watch workouts with heart-rate samples", () => {
    const { workouts } = parseHealthPayload({
      data: {
        workouts: [
          {
            id: "ABC",
            name: "Outdoor Run",
            start: "2026-11-12 10:00:00 +0200",
            end: "2026-11-12 10:30:00 +0200",
            duration: 1800,
            distance: { qty: 5.2, units: "km" },
            activeEnergyBurned: { qty: 340, units: "kcal" },
            heartRateData: [
              { date: "2026-11-12 10:00:00 +0200", Min: 120, Avg: 130, Max: 140 },
              { date: "2026-11-12 10:15:00 +0200", Min: 150, Avg: 160, Max: 170 },
            ],
          },
          { name: "broken, no dates" },
        ],
      },
    });
    expect(workouts).toHaveLength(1);
    expect(workouts[0]).toMatchObject({ externalId: "ABC", activityType: "Outdoor Run", durationSec: 1800, distanceM: 5200, activeKcal: 340, avgHr: 145, maxHr: 160 });
    expect(workouts[0].hrSamples).toHaveLength(2);
  });

  it("accepts the flat form sent by a Shortcut", () => {
    const { metrics } = parseHealthPayload({ metrics: [{ name: "resting_heart_rate", date: "2026-11-12", qty: 54 }] });
    expect(metrics).toEqual([{ metric: "resting_heart_rate", day: "2026-11-12", value: 54 }]);
  });
});
