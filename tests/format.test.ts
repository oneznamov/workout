import { describe, expect, it } from "vitest";
import { addDays, dayOf, e1rm, fmtClock, fmtDuration, plural, weekStart } from "@/lib/format";

describe("dates", () => {
  it("uses the app time zone (Kyiv) for the calendar day", () => {
    // 23:30 UTC is already the next day in Kyiv.
    expect(dayOf(new Date("2026-11-12T23:30:00Z"))).toBe("2026-11-13");
    expect(dayOf(new Date("2026-11-12T10:00:00Z"))).toBe("2026-11-12");
  });
  it("adds days across month and year ends", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("finds the Monday of a week", () => {
    expect(weekStart("2026-11-12")).toBe("2026-11-09"); // Thursday
    expect(weekStart("2026-11-09")).toBe("2026-11-09"); // Monday
    expect(weekStart("2026-11-15")).toBe("2026-11-09"); // Sunday
  });
});

describe("numbers", () => {
  it("formats clocks and durations", () => {
    expect(fmtClock(185)).toBe("3:05");
    expect(fmtClock(3725)).toBe("1:02:05");
    expect(fmtDuration(45 * 60)).toBe("45 хв");
    expect(fmtDuration(3900)).toBe("1 год 5 хв");
  });
  it("estimates a one-rep max (Epley)", () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 5)).toBeCloseTo(116.67, 1);
    expect(e1rm(100, 0)).toBe(0);
  });
  it("declines Ukrainian nouns", () => {
    const forms: [string, string, string] = ["вправа", "вправи", "вправ"];
    expect(plural(1, forms)).toBe("1 вправа");
    expect(plural(3, forms)).toBe("3 вправи");
    expect(plural(5, forms)).toBe("5 вправ");
    expect(plural(11, forms)).toBe("11 вправ");
    expect(plural(21, forms)).toBe("21 вправа");
  });
});
