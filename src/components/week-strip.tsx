"use client";

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { cx, fmtDate } from "@/lib/format";

export type StripDay = { day: string; done: boolean; planned: boolean; cardio: string | null };
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

/**
 * The week at a glance — and the weeks around it: swipe (or scroll) sideways to look back at
 * what was done and ahead at what is planned. Opens on the current week.
 */
export function WeekStrip({ weeks, today, current }: { weeks: StripDay[][]; today: string; current: number }) {
  const strip = useRef<HTMLDivElement>(null);
  // Start on the current week. The strip may still be hidden (zero width) when it mounts —
  // the page streams in — so wait for the first real size.
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    let placed = false;
    const place = () => {
      if (placed || el.clientWidth === 0) return;
      placed = true;
      el.scrollLeft = el.clientWidth * current;
      observer.disconnect();
    };
    const observer = new ResizeObserver(place);
    observer.observe(el);
    place();
    return () => observer.disconnect();
  }, [current]);
  return (
    <div
      ref={strip}
      className="card flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none]"
      role="group"
      aria-label="Тижні: гортайте вбік"
    >
      {weeks.map((week, i) => (
        <div key={week[0].day} className="w-full shrink-0 snap-center p-3">
          <div className={cx("caps mb-2 text-center", i === current && "text-ink-2")}>
            {i === current ? "Цей тиждень" : `${fmtDate(week[0].day)} – ${fmtDate(week[6].day)}`}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {week.map((d, j) => (
              <div
                key={d.day}
                className="flex flex-col items-center gap-1.5"
                aria-label={`${fmtDate(d.day)}: ${d.done ? "силове виконано" : d.planned ? "заплановано" : "без силового"}${d.cardio ? ", було кардіо" : ""}`}
              >
                <span className={cx("text-[11px] font-semibold", d.day === today ? "text-accent" : "text-muted")}>{WEEKDAYS[j]}</span>
                <span
                  className={cx(
                    "num grid size-9 place-items-center rounded-full text-sm font-semibold",
                    d.done ? "bg-accent text-accent-ink" : d.planned ? "text-ink ring-2 ring-accent/60" : "bg-surface-2 text-muted",
                    d.day === today && !d.done && "text-ink",
                  )}
                >
                  {d.done ? <Check size={17} strokeWidth={3} /> : Number(d.day.slice(8))}
                </span>
                <span className="size-1.5 rounded-full" style={{ background: d.cardio ?? "transparent" }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
