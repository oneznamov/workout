"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtNum } from "@/lib/format";

const SERIES = "#3987e5";
const MUTED = "#898781";
const GRID = "#2c2c2a";
const AXIS = "#383835";

export type Point = { label: string; value: number | null; hint?: string };

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
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs shadow-lg">
      <div className="text-muted">{p.hint ?? p.label}</div>
      <div className="tabular text-sm font-medium text-ink">
        {fmtNum(p.value, digits)} {unit}
      </div>
    </div>
  );
}

const axisProps = {
  tick: { fill: MUTED, fontSize: 11 },
  tickLine: false,
} as const;

/** Single-series chart: `line` for values over time, `bar` for per-period totals. */
export function TrendChart({
  data,
  kind = "line",
  unit,
  digits = 0,
  height = 200,
  zeroBased,
  integer,
}: {
  data: Point[];
  kind?: "line" | "bar";
  unit?: string;
  digits?: number;
  height?: number;
  zeroBased?: boolean;
  /** Counts: never show fractional ticks. */
  integer?: boolean;
}) {
  const hasData = data.some((d) => d.value != null);
  if (!hasData) {
    return (
      <div className="grid place-items-center text-sm text-muted" style={{ height }}>
        Поки немає даних
      </div>
    );
  }
  const yDomain: [number | string, number | string] =
    kind === "bar" || zeroBased ? [0, "auto"] : ["auto", "auto"];
  const common = {
    data,
    margin: { top: 8, right: 8, bottom: 0, left: 0 },
  };
  const axes = (
    <>
      <CartesianGrid stroke={GRID} vertical={false} />
      <XAxis dataKey="label" {...axisProps} axisLine={{ stroke: AXIS }} minTickGap={24} />
      <YAxis
        {...axisProps}
        axisLine={false}
        width={44}
        domain={yDomain}
        allowDecimals={!integer}
        tickFormatter={(v: number) => (Math.abs(v) >= 10000 ? `${fmtNum(v / 1000, 0)}K` : fmtNum(v, digits))}
      />
      <Tooltip
        cursor={kind === "bar" ? { fill: "rgba(255,255,255,0.05)" } : { stroke: AXIS }}
        content={<Tip unit={unit} digits={digits} />}
      />
    </>
  );
  return (
    <div style={{ height }} role="img" aria-label="Графік">
      <ResponsiveContainer width="100%" height="100%">
        {kind === "bar" ? (
          <BarChart {...common}>
            {axes}
            <Bar dataKey="value" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          </BarChart>
        ) : (
          <AreaChart {...common}>
            {axes}
            <Area
              type="monotone"
              dataKey="value"
              stroke={SERIES}
              strokeWidth={2}
              fill={SERIES}
              fillOpacity={0.1}
              connectNulls
              dot={data.length <= 24 ? { r: 3, fill: SERIES, stroke: "#1a1a19", strokeWidth: 2 } : false}
              activeDot={{ r: 5, fill: SERIES, stroke: "#1a1a19", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal ranking bars (e.g. sets per muscle group). */
export function RankBars({ items, unit }: { items: { label: string; value: number }[]; unit?: string }) {
  if (items.length === 0) return <div className="py-6 text-center text-sm text-muted">Поки немає даних</div>;
  const max = Math.max(...items.map((i) => i.value));
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.label} className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-3 text-sm">
          <span className="truncate text-ink-2">{i.label}</span>
          <span className="h-3">
            <span
              className="block h-full rounded-r-[4px]"
              style={{ width: `${Math.max(2, (i.value / max) * 100)}%`, background: SERIES }}
            />
          </span>
          <span className="tabular text-right text-ink">
            {fmtNum(i.value)}
            {unit && <span className="text-muted"> {unit}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
