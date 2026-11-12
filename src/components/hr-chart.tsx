"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmtClock, fmtTime } from "@/lib/format";

export type HrBand = { start: string; end: string; label: string };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Heart rate over a workout. Optional bands mark when sets were performed, so effort
 * and recovery can be read off the same picture.
 */
export function HrChart({
  samples,
  start,
  end,
  bands = [],
  height = 190,
}: {
  samples: { t: string; bpm: number }[];
  start: string;
  end: string;
  bands?: HrBand[];
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    const t0 = +new Date(start);
    const t1 = Math.max(+new Date(end), t0 + 60000);
    const pts = samples
      .map((s) => ({ t: +new Date(s.t), bpm: s.bpm }))
      .filter((p) => p.t >= t0 - 30000 && p.t <= t1 + 30000)
      .sort((a, b) => a.t - b.t);
    if (pts.length < 2) return null;
    const lo = Math.floor((Math.min(...pts.map((p) => p.bpm)) - 5) / 10) * 10;
    const hi = Math.ceil((Math.max(...pts.map((p) => p.bpm)) + 5) / 10) * 10;
    return { t0, t1, pts, lo, hi };
  }, [samples, start, end]);

  if (!model) return null;
  const { t0, t1, pts, lo, hi } = model;
  const padR = 34;
  const padB = 20;
  const padT = 8;
  const w = Math.max(0, width - padR);
  const h = height - padB - padT;
  const x = (t: number) => ((t - t0) / (t1 - t0)) * w;
  const y = (bpm: number) => padT + h - ((bpm - lo) / (hi - lo)) * h;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.bpm).toFixed(1)}`).join("");
  const area = `${line}L${x(pts[pts.length - 1].t).toFixed(1)},${padT + h}L${x(pts[0].t).toFixed(1)},${padT + h}Z`;
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  const active = hover != null ? pts[hover] : null;
  const activeBand = active ? bands.find((b) => active.t >= +new Date(b.start) && active.t <= +new Date(b.end)) : undefined;

  const onMove = (clientX: number, rect: DOMRect) => {
    const t = t0 + ((clientX - rect.left) / Math.max(1, w)) * (t1 - t0);
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].t - t) < Math.abs(pts[best].t - t)) best = i;
    setHover(best);
  };

  return (
    <div ref={ref} className="relative select-none" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Пульс під час тренування: від ${Math.min(...pts.map((p) => p.bpm))} до ${Math.max(...pts.map((p) => p.bpm))} уд/хв`}
          onPointerMove={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerDown={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setHover(null)}
          className="touch-pan-y"
        >
          <defs>
            <linearGradient id="hr-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--c-heart)" stopOpacity="0.28" />
              <stop offset="1" stopColor="var(--c-heart)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {bands.map((b, i) => {
            const bx = x(+new Date(b.start));
            const bw = Math.max(2, x(+new Date(b.end)) - bx);
            return <rect key={i} x={bx} y={padT} width={bw} height={h} rx={2} fill="var(--ink)" opacity={0.09} />;
          })}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={0} x2={w} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
              <text x={w + 6} y={y(t) + 4} fontSize={11} fill="var(--muted)">
                {t}
              </text>
            </g>
          ))}
          <path d={area} fill="url(#hr-fill)" />
          <path d={line} fill="none" stroke="var(--c-heart)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {[0, 0.5, 1].map((f) => (
            <text
              key={f}
              x={f * w}
              y={height - 4}
              fontSize={11}
              fill="var(--muted)"
              textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"}
            >
              {fmtTime(new Date(t0 + f * (t1 - t0)))}
            </text>
          ))}
          {active && (
            <g>
              <line x1={x(active.t)} x2={x(active.t)} y1={padT} y2={padT + h} stroke="var(--axis)" strokeWidth={1} />
              <circle cx={x(active.t)} cy={y(active.bpm)} r={5} fill="var(--c-heart)" stroke="var(--surface)" strokeWidth={2} />
            </g>
          )}
        </svg>
      )}
      {active && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl bg-surface-3 px-3 py-1.5 text-xs whitespace-nowrap shadow-lg"
          style={{ left: Math.min(Math.max(x(active.t), 60), Math.max(60, w - 60)) }}
        >
          <span className="num text-sm font-semibold">{active.bpm}</span> <span className="text-muted">уд/хв</span>
          <span className="ml-2 text-muted">
            {fmtTime(new Date(active.t))} · {fmtClock((active.t - t0) / 1000)}
          </span>
          {activeBand && <span className="block text-ink-2">{activeBand.label}</span>}
        </div>
      )}
    </div>
  );
}
