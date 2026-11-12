"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtNum } from "@/lib/format";

export type Point = {
  label: string;
  value: number | null;
  hint?: string;
  /** Shown in the tooltip instead of the formatted number (e.g. a pace "5:30 /км"). */
  display?: string;
};

/** CSS color for a data category, e.g. "var(--c-heart)". */
export type ChartColor = string;
const DEFAULT_COLOR = "var(--c-strength)";

function Tip({
  active,
  payload,
  unit,
  digits,
}: {
  active?: boolean;
  payload?: { payload: Point }[];
  unit?: string;
  digits: number;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (p.value == null) return null;
  return (
    <div className="rounded-xl bg-surface-3 px-3 py-1.5 text-xs shadow-lg">
      <div className="text-muted">{p.hint ?? p.label}</div>
      <div className="num text-base font-semibold text-ink">
        {p.display ?? fmtNum(p.value, digits)} {!p.display && <span className="text-xs font-medium text-muted">{unit}</span>}
      </div>
    </div>
  );
}

const tick = { fill: "var(--muted)", fontSize: 11 } as const;

/** Single-series chart: `line` for values over time, `bar` for per-period totals. */
export function TrendChart({
  data,
  kind = "line",
  unit,
  digits = 0,
  height = 190,
  zeroBased,
  integer,
  color = DEFAULT_COLOR,
}: {
  data: Point[];
  kind?: "line" | "bar";
  unit?: string;
  digits?: number;
  height?: number;
  zeroBased?: boolean;
  /** Counts: never show fractional ticks. */
  integer?: boolean;
  color?: ChartColor;
}) {
  const hasData = data.some((d) => d.value != null);
  if (!hasData) {
    return (
      <div className="grid place-items-center text-sm text-muted" style={{ height }}>
        Поки немає даних
      </div>
    );
  }
  const gradientId = `fill-${color.replace(/[^a-z0-9]/gi, "")}`;
  const yDomain: [number | string, number | string] = kind === "bar" || zeroBased ? [0, "auto"] : ["auto", "auto"];
  const common = { data, margin: { top: 8, right: 0, bottom: 0, left: 0 } };
  const axes = (
    <>
      <CartesianGrid stroke="var(--grid)" vertical={false} />
      <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} minTickGap={28} tickMargin={6} />
      <YAxis
        orientation="right"
        tick={tick}
        tickLine={false}
        axisLine={false}
        width={38}
        tickCount={4}
        domain={yDomain}
        allowDecimals={!integer}
        tickFormatter={(v: number) => (Math.abs(v) >= 10000 ? `${fmtNum(v / 1000, 0)}K` : fmtNum(v, digits))}
      />
      <Tooltip
        cursor={kind === "bar" ? { fill: "rgba(255,255,255,0.06)" } : { stroke: "var(--axis)" }}
        content={<Tip unit={unit} digits={digits} />}
      />
    </>
  );
  return (
    <div style={{ height }} role="img" aria-label="Графік">
      <ResponsiveContainer width="100%" height="100%">
        {kind === "bar" ? (
          <BarChart {...common} barCategoryGap="22%">
            {axes}
            <Bar dataKey="value" fill={color} radius={[5, 5, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          </BarChart>
        ) : (
          <AreaChart {...common}>
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={color} stopOpacity={0.3} />
                <stop offset="1" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            {axes}
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2.5}
              fill={`url(#${gradientId})`}
              connectNulls
              dot={data.length <= 24 ? { r: 3.5, fill: color, stroke: "var(--surface)", strokeWidth: 2 } : false}
              activeDot={{ r: 5.5, fill: color, stroke: "var(--surface)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal ranking bars. */
export function RankBars({ items, unit, color = DEFAULT_COLOR }: { items: { label: string; value: number }[]; unit?: string; color?: ChartColor }) {
  if (items.length === 0) return <div className="py-6 text-center text-sm text-muted">Поки немає даних</div>;
  const max = Math.max(...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.label} className="grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-3 text-sm">
          <span className="truncate text-ink-2">{i.label}</span>
          <span className="h-2.5 rounded-full bg-surface-2">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(3, (i.value / max) * 100)}%`, background: color }} />
          </span>
          <span className="num text-right font-semibold text-ink">
            {fmtNum(i.value)}
            {unit && <span className="text-xs font-medium text-muted"> {unit}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export type StackPoint = { label: string; hint?: string; values: number[] };

function StackTip({
  active,
  payload,
  series,
  unit,
}: {
  active?: boolean;
  payload?: { payload: StackPoint }[];
  series: { label: string; color: ChartColor }[];
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl bg-surface-3 px-3 py-1.5 text-xs shadow-lg">
      <div className="text-muted">{p.hint ?? p.label}</div>
      {series.map((s, i) => (
        <div key={s.label} className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: s.color }} />
          <span className="text-ink-2">{s.label}</span>
          <span className="num ml-auto pl-3 text-sm font-semibold text-ink">
            {fmtNum(p.values[i], 1)} <span className="text-xs font-medium text-muted">{unit}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Stacked per-period bars for two or three categories, with a legend. */
export function StackedBars({
  data,
  series,
  unit,
  height = 190,
}: {
  data: StackPoint[];
  series: { label: string; color: ChartColor }[];
  unit?: string;
  height?: number;
}) {
  const rows = data.map((d) => ({ ...d, ...Object.fromEntries(d.values.map((v, i) => [`v${i}`, v])) }));
  const hasData = data.some((d) => d.values.some((v) => v > 0));
  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {series.map((s, i) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: s.color }} />
            {s.label}
            <span className="num font-semibold text-ink">{fmtNum(data.reduce((a, d) => a + d.values[i], 0), 1)}</span>
            {unit}
          </li>
        ))}
      </ul>
      {hasData ? (
        <div style={{ height }} role="img" aria-label="Графік за тижнями">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} barCategoryGap="22%">
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} minTickGap={28} tickMargin={6} />
              <YAxis orientation="right" tick={tick} tickLine={false} axisLine={false} width={38} tickCount={4} />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.06)" }} content={<StackTip series={series} unit={unit} />} />
              {series.map((s, i) => (
                <Bar
                  key={s.label}
                  dataKey={`v${i}`}
                  stackId="a"
                  fill={s.color}
                  stroke="var(--surface)"
                  strokeWidth={1}
                  radius={i === series.length - 1 ? [5, 5, 0, 0] : 0}
                  maxBarSize={22}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="grid place-items-center text-sm text-muted" style={{ height }}>
          Поки немає даних
        </div>
      )}
    </div>
  );
}
