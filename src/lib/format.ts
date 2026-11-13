import { appConfig } from "./config";

export const TZ = process.env.NEXT_PUBLIC_APP_TZ ?? appConfig.timeZone;

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** YYYY-MM-DD of a moment in the app time zone. */
export function dayOf(d: Date | string = new Date()) {
  return dayFmt.format(typeof d === "string" ? new Date(d) : d);
}

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `day` (YYYY-MM-DD). */
export function weekStart(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(day, -dow);
}

export function fmtDate(d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d.length === 10 ? `${d}T12:00:00Z` : d) : d;
  return new Intl.DateTimeFormat("uk-UA", { timeZone: TZ, ...opts }).format(date);
}

export function fmtDateLong(d: Date | string | null | undefined) {
  return fmtDate(d, { weekday: "short", day: "numeric", month: "long" });
}

export function fmtTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("uk-UA", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}

/** 3725 → "1:02:05", 185 → "3:05" */
export function fmtClock(totalSec: number) {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

/** 3725 → "1 год 2 хв" */
export function fmtDuration(totalSec: number | null | undefined) {
  if (totalSec == null) return "—";
  const m = Math.round(totalSec / 60);
  if (m < 60) return `${m} хв`;
  return `${Math.floor(m / 60)} год ${m % 60} хв`;
}

/** A duration as a big number and its unit, short enough for a stat tile: 55 + "хв", 5:30 + "год". */
export function durationParts(totalSec: number | null | undefined): { value: string; unit?: string } {
  if (totalSec == null) return { value: "—" };
  const m = Math.round(totalSec / 60);
  return m < 60 ? { value: String(m), unit: "хв" } : { value: `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`, unit: "год" };
}

export function fmtNum(n: number | null | undefined, digits = 0) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: digits }).format(n);
}

export function fmtWeight(n: number | null | undefined) {
  if (n == null) return "—";
  return String(Math.round(n * 100) / 100);
}

/** Epley estimated one-rep max. */
export function e1rm(weight: number, reps: number) {
  if (reps <= 0) return 0;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/** Ukrainian plural: plural(3, ["вправа", "вправи", "вправ"]) → "3 вправи" */
export function plural(n: number, forms: [string, string, string]) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  const form = a > 10 && a < 20 ? forms[2] : b === 1 ? forms[0] : b >= 2 && b <= 4 ? forms[1] : forms[2];
  return `${n} ${form}`;
}
export const EXERCISES_FORMS: [string, string, string] = ["вправа", "вправи", "вправ"];
export const SETS_FORMS: [string, string, string] = ["підхід", "підходи", "підходів"];
