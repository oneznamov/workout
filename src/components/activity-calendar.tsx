import { addDays, cx, fmtDate } from "@/lib/format";

export type DayActivity = { gym?: boolean; run?: boolean; cycle?: boolean; other?: boolean; title: string };

const COLORS = { gym: "var(--c-strength)", run: "var(--c-run)", cycle: "var(--c-cycle)", other: "var(--c-heart)" } as const;
const LEGEND: [keyof typeof COLORS, string][] = [
  ["gym", "Силове"],
  ["run", "Біг"],
  ["cycle", "Вело"],
  ["other", "Інше кардіо"],
];
const WEEKDAYS = ["Пн", "", "Ср", "", "Пт", "", "Нд"];

/** Which days had training, week by week (columns) — one square per day, coloured by kind. */
export function ActivityCalendar({
  from,
  weeks,
  today,
  days,
}: {
  /** Monday of the first week */
  from: string;
  weeks: number;
  today: string;
  days: Record<string, DayActivity>;
}) {
  const used = new Set<keyof typeof COLORS>();
  for (const a of Object.values(days)) for (const k of Object.keys(COLORS) as (keyof typeof COLORS)[]) if (a[k]) used.add(k);
  const columns = Array.from({ length: weeks }, (_, w) => {
    const monday = addDays(from, w * 7);
    const cells = Array.from({ length: 7 }, (_, d) => addDays(monday, d));
    const first = cells.find((c) => c.endsWith("-01"));
    return { monday, cells, label: w === 0 || first ? fmtDate(first ?? monday, { month: "short" }) : "" };
  });
  return (
    <div>
      <div
        className="grid grid-flow-col gap-[3px]"
        style={{
          gridTemplateRows: "auto repeat(7, auto)",
          gridTemplateColumns: `auto repeat(${weeks}, minmax(0, 1fr))`,
          maxWidth: weeks * 26 + 30,
        }}
        role="img"
        aria-label={`Календар тренувань за ${weeks} тижнів: ${Object.keys(days).length} днів з активністю`}
      >
        <span />
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="pr-1.5 text-[10px] leading-none text-muted" style={{ alignSelf: "center" }}>
            {d}
          </span>
        ))}
        {columns.map((col) => (
          <Column key={col.monday} col={col} today={today} days={days} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {LEGEND.filter(([k]) => k !== "other" || used.has("other")).map(([k, label]) => (
          <li key={k} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: COLORS[k] }} />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Column({
  col,
  today,
  days,
}: {
  col: { monday: string; cells: string[]; label: string };
  today: string;
  days: Record<string, DayActivity>;
}) {
  return (
    <>
      <span className="h-3.5 overflow-visible text-[10px] leading-none whitespace-nowrap text-muted">{col.label}</span>
      {col.cells.map((day) => {
        const a = days[day];
        const kinds = a ? (Object.keys(COLORS) as (keyof typeof COLORS)[]).filter((k) => a[k]) : [];
        const background =
          kinds.length === 0
            ? undefined
            : kinds.length === 1
              ? COLORS[kinds[0]]
              : `linear-gradient(135deg, ${COLORS[kinds[0]]} 50%, ${COLORS[kinds[1]]} 50%)`;
        return (
          <span
            key={day}
            title={a ? `${fmtDate(day, { day: "numeric", month: "long" })}: ${a.title}` : fmtDate(day, { day: "numeric", month: "long" })}
            className={cx(
              "aspect-square rounded-[4px]",
              day > today ? "bg-transparent" : !background && "bg-surface-2",
              day === today && "ring-1 ring-ink/60",
            )}
            style={background ? { background } : undefined}
          />
        );
      })}
    </>
  );
}
