/**
 * How ready the athlete is today, read from last night's sleep against their own usual
 * night — with resting pulse and heart-rate variability as a second opinion. Pure.
 * A short night makes today's session lighter; a bad one argues for rest.
 */
export type ReadinessLevel = "rested" | "normal" | "short" | "poor" | "unknown";
export type Readiness = {
  level: ReadinessLevel;
  /** hours slept in the night that ended today; null when the watch has not reported it yet */
  lastNight: number | null;
  /** the athlete's usual night over the previous three weeks, hours */
  usual: number | null;
  /** average of the last three nights, hours */
  lastThree: number | null;
  /** what the judgement rests on, in plain words */
  reasons: string[];
  /** one sentence: what to do about it */
  advice: string;
};
type Row = { metric: string; day: string; value: number };

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null);
const shift = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** "5 год 20 хв" */
export function fmtHours(hours: number): string {
  const min = Math.round(hours * 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} год ${m} хв` : `${h} год`;
}

const ADVICE: Record<ReadinessLevel, string> = {
  rested: "Добре виспались — можна працювати на повну.",
  normal: "",
  short: "Варто полегшити тренування: менше підходів, трохи менша вага, без підходів до відмови.",
  poor: "Сьогодні краще легке тренування або відпочинок.",
  unknown: "",
};

export function readiness(rows: Row[], today: string): Readiness {
  const of = (metric: string) => rows.filter((r) => r.metric === metric && r.day <= today && r.day >= shift(today, -24));
  const sleep = of("sleep_analysis");
  const tonight = sleep.find((r) => r.day === today)?.value ?? null;
  const before = sleep.filter((r) => r.day < today).map((r) => r.value);
  const usual = before.length >= 3 ? avg(before) : null;
  const lastThree = avg(sleep.filter((r) => r.day > shift(today, -3)).map((r) => r.value));
  const reasons: string[] = [];
  if (tonight == null) return { level: "unknown", lastNight: null, usual, lastThree, reasons, advice: "" };

  let score = 0; // 0 normal, 1 short, 2 poor; -1 rested
  if (tonight < 5 || (usual != null && tonight <= usual - 2)) score = 2;
  else if (tonight < 6 || (usual != null && tonight <= usual - 1)) score = 1;
  else if (tonight >= 7.5 && (usual == null || tonight >= usual - 0.25)) score = -1;
  const gap = usual != null ? tonight - usual : null;
  reasons.push(
    `спали ${fmtHours(tonight)}${gap != null && Math.abs(gap) >= 0.5 ? ` — на ${fmtHours(Math.abs(gap))} ${gap < 0 ? "менше" : "більше"} звичного` : ""}`,
  );
  // Several short nights in a row weigh more than one.
  if (lastThree != null && lastThree < 6 && score < 1) score = 1;
  if (lastThree != null && lastThree < 6) reasons.push(`за три ночі в середньому ${fmtHours(lastThree)}`);

  // The body's second opinion: a raised resting pulse or a dropped HRV means recovery is behind.
  const second = (metric: string) => {
    const all = of(metric);
    const now = all.find((r) => r.day === today)?.value ?? null;
    const base = avg(all.filter((r) => r.day < today).map((r) => r.value));
    return now != null && base != null && all.length >= 4 ? { now, base } : null;
  };
  const rhr = second("resting_heart_rate");
  const hrv = second("heart_rate_variability");
  let strained = false;
  if (rhr && rhr.now >= rhr.base + 6) {
    strained = true;
    reasons.push(`пульс спокою ${Math.round(rhr.now)} — на ${Math.round(rhr.now - rhr.base)} вищий за звичний`);
  }
  if (hrv && hrv.now <= hrv.base * 0.8) {
    strained = true;
    reasons.push(`варіабельність пульсу на ${Math.round((1 - hrv.now / hrv.base) * 100)}% нижча за звичну`);
  }
  if (strained) score = Math.min(2, Math.max(score, 0) + 1);

  const level: ReadinessLevel = score >= 2 ? "poor" : score === 1 ? "short" : score < 0 ? "rested" : "normal";
  return { level, lastNight: tonight, usual, lastThree, reasons, advice: ADVICE[level] };
}

/** Whether today's session should be made lighter. */
export const needsLighter = (r: Readiness) => r.level === "short" || r.level === "poor";

/** What to tell the AI when the athlete asks to lighten a workout because of the night. */
export function lightenRequest(r: Readiness): string {
  return `Відновлення сьогодні гірше: ${r.reasons.join("; ")}. Полегши це тренування під такий стан: ${
    r.level === "poor"
      ? "зроби його коротким і легким — менше вправ і підходів, вага на 15–25% менша, без підходів до відмови; якщо доречніше — заміни на відновлювальне"
      : "прибери один-два найважчі підходи, зменш вагу на 5–15%, без підходів до відмови, структуру збережи"
  }. У примітці коротко поясни, що змінилось через сон.`;
}
