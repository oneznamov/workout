/**
 * Picks the Apple Health metrics worth a look right now: ones that have drifted away from the
 * person's own usual level (or a common-sense threshold), and ones that are clearly good.
 * Pure — the last 7 days are compared with the three weeks before them.
 */
export type VitalNote = { metric: string; status: "attention" | "great"; text: string; recent: number };
type Row = { metric: string; day: string; value: number };

const avg = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
const r1 = (n: number) => Math.round(n * 10) / 10;

export function notableVitals(rows: Row[], today: string): VitalNote[] {
  const cut = (days: number) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
  };
  const week = cut(7);
  const month = cut(28);
  const notes: VitalNote[] = [];
  const note = (metric: string, status: VitalNote["status"], text: string, recent: number) => notes.push({ metric, status, text, recent });
  for (const metric of new Set(rows.map((r) => r.metric))) {
    const all = rows.filter((r) => r.metric === metric && r.day > month);
    const recentRows = all.filter((r) => r.day > week);
    const baseRows = all.filter((r) => r.day <= week);
    if (recentRows.length < 2) continue;
    const recent = avg(recentRows.map((r) => r.value));
    const base = baseRows.length >= 4 ? avg(baseRows.map((r) => r.value)) : null;
    switch (metric) {
      case "resting_heart_rate":
        if (base != null && recent >= base + 5) note(metric, "attention", `На ${r1(recent - base)} уд/хв вищий за ваш звичний — можливі втома, недосип або хвороба.`, recent);
        else if (recent > 80) note(metric, "attention", "Вищий за 80 уд/хв у спокої.", recent);
        else if (base != null && recent <= base - 3) note(metric, "great", `На ${r1(base - recent)} уд/хв нижчий за звичний — добра ознака відновлення.`, recent);
        else if (recent < 55) note(metric, "great", "Нижчий за 55 уд/хв — добре треноване серце.", recent);
        break;
      case "heart_rate_variability":
        if (base != null && recent <= base * 0.85) note(metric, "attention", `На ${Math.round((1 - recent / base) * 100)}% нижча за звичну — організм відновлюється гірше.`, recent);
        else if (base != null && recent >= base * 1.15) note(metric, "great", `На ${Math.round((recent / base - 1) * 100)}% вища за звичну — добре відновлення.`, recent);
        break;
      case "sleep_analysis":
        if (recent < 6) note(metric, "attention", "У середньому менше 6 годин сну за тиждень.", recent);
        else if (recent >= 7.5) note(metric, "great", "У середньому понад 7,5 години сну за тиждень.", recent);
        break;
      case "step_count":
        if (recent < 4000) note(metric, "attention", "Менше 4 000 кроків на день за тиждень.", recent);
        else if (recent >= 10000) note(metric, "great", "Понад 10 000 кроків на день за тиждень.", recent);
        break;
      case "vo2_max":
        if (base != null && recent >= base + 1) note(metric, "great", `Зріс на ${r1(recent - base)} за місяць — витривалість покращується.`, recent);
        else if (base != null && recent <= base - 1) note(metric, "attention", `Знизився на ${r1(base - recent)} за місяць.`, recent);
        break;
      case "blood_oxygen_saturation":
        if (recent < 94) note(metric, "attention", "Нижче 94% — якщо це тримається, варто звернутися до лікаря.", recent);
        break;
      case "respiratory_rate":
        if (base != null && recent >= base + 2) note(metric, "attention", `На ${r1(recent - base)} вдихів за хвилину частіше, ніж зазвичай.`, recent);
        break;
    }
  }
  return notes.sort((a, b) => (a.status === b.status ? 0 : a.status === "attention" ? -1 : 1));
}
