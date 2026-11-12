"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { queueMetric, syncAll } from "@/lib/client/offline";
import { fmtDate, fmtNum } from "@/lib/format";

/**
 * Body weight at a glance with a one-tap update: nudge the last value and save.
 * Saved on the device first, so it also works with no connection.
 */
export function WeightQuick({ today, points }: { today: string; points: { day: string; value: number }[] }) {
  const router = useRouter();
  const last = points.at(-1);
  const prev = points.length > 1 ? points[points.length - 2] : undefined;
  const [value, setValue] = useState(last ? last.value.toFixed(1) : "");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const num = Number(value.replace(",", "."));
  const valid = Number.isFinite(num) && num > 20 && num < 400;
  const nudge = (d: number) => {
    setSaved(false);
    setValue((Math.round(((valid ? num : (last?.value ?? 70)) + d) * 10) / 10).toFixed(1));
  };
  const delta = last && prev ? last.value - prev.value : null;

  // tiny trend line
  const spark = (() => {
    if (points.length < 2) return null;
    const vals = points.slice(-30).map((p) => p.value);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const w = 120;
    const h = 36;
    const d = vals
      .map((v, i) => `${i ? "L" : "M"}${((i / (vals.length - 1)) * w).toFixed(1)},${(h - 3 - ((v - lo) / (hi - lo || 1)) * (h - 6)).toFixed(1)}`)
      .join("");
    return (
      <svg width={w} height={h} aria-hidden="true">
        <path d={d} fill="none" stroke="var(--c-body)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  })();

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="num text-[2.25rem] leading-none font-semibold text-body">
            {last ? fmtNum(last.value, 1) : "—"}
            <span className="ml-1 text-base font-medium text-muted">кг</span>
          </div>
          <div className="mt-1 text-xs text-muted">
            {last ? fmtDate(last.day) : "ще немає записів"}
            {delta != null && delta !== 0 && ` · ${delta > 0 ? "+" : "−"}${fmtNum(Math.abs(delta), 1)} кг до попереднього`}
          </div>
        </div>
        {spark}
      </div>
      <form
        className="mt-4 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          start(async () => {
            queueMetric({ metric: "body_mass", day: today, value: num });
            await syncAll();
            setSaved(true);
            router.refresh();
          });
        }}
      >
        <button type="button" onClick={() => nudge(-0.1)} aria-label="Мінус 0,1 кг" className="icon-btn bg-surface-2 text-ink">
          <Minus size={18} />
        </button>
        <input
          value={value}
          onChange={(e) => {
            setSaved(false);
            setValue(e.target.value);
          }}
          inputMode="decimal"
          aria-label="Вага сьогодні, кг"
          placeholder="80.0"
          className="num h-11 w-full min-w-0 rounded-full bg-surface-2 text-center text-lg font-semibold outline-none focus:ring-2 focus:ring-accent"
        />
        <button type="button" onClick={() => nudge(0.1)} aria-label="Плюс 0,1 кг" className="icon-btn bg-surface-2 text-ink">
          <Plus size={18} />
        </button>
        <button type="submit" disabled={!valid || pending} className="btn btn-primary shrink-0">
          {saved ? <Check size={18} strokeWidth={3} /> : null}
          {saved ? "Записано" : "Записати"}
        </button>
      </form>
    </div>
  );
}
