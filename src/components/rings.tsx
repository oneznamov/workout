import type { ReactNode } from "react";
import { fmtNum } from "@/lib/format";

export type Ring = { label: string; value: number; goal: number; unit: string; color: string; icon?: ReactNode };

/** Concentric progress rings for weekly goals, with the numbers spelled out beside them. */
export function Rings({ rings, size = 148 }: { rings: Ring[]; size?: number }) {
  const stroke = 15;
  const gap = 3;
  const c = size / 2;
  return (
    <div className="flex items-center gap-5">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="shrink-0 -rotate-90"
        role="img"
        aria-label={rings.map((r) => `${r.label}: ${fmtNum(r.value)} з ${fmtNum(r.goal)} ${r.unit}`).join("; ")}
      >
        {rings.map((r, i) => {
          const radius = c - stroke / 2 - i * (stroke + gap);
          const len = 2 * Math.PI * radius;
          const p = Math.max(0, Math.min(1, r.goal > 0 ? r.value / r.goal : 0));
          return (
            <g key={r.label}>
              <circle cx={c} cy={c} r={radius} fill="none" stroke={r.color} strokeOpacity={0.22} strokeWidth={stroke} />
              {p > 0 && (
                <circle
                  cx={c}
                  cy={c}
                  r={radius}
                  fill="none"
                  stroke={r.color}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={`${Math.max(0.01, p * len)} ${len}`}
                />
              )}
            </g>
          );
        })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-2.5">
        {rings.map((r) => (
          <li key={r.label}>
            <div className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: r.color }}>
              {r.icon}
              {r.label}
            </div>
            <div className="num text-[1.35rem] leading-tight font-semibold">
              {fmtNum(r.value)}
              <span className="text-muted">/{fmtNum(r.goal)}</span>
              <span className="ml-1 text-xs font-medium text-muted">{r.unit}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
