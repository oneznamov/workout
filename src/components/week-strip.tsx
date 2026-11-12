"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { cx, fmtDate } from "@/lib/format";

/** `sessions` — everything done that day, strength and cardio together. */
export type StripDay = { day: string; done: boolean; planned: boolean; sessions: number };

/** One dot per session of the day; from three on the dots turn hot, so a heavy day stands out. */
export function SessionDots({ count, dim }: { count: number; dim?: boolean }) {
  const n = Math.min(3, Math.max(0, count));
  return (
    <span className={cx("flex h-1.5 items-center justify-center gap-0.5", dim && "opacity-60")} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={cx("size-1.5 rounded-full", count >= 3 ? "bg-heart" : "bg-accent")} />
      ))}
    </span>
  );
}
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

/**
 * The week at a glance — and the weeks around it: swipe (or scroll) sideways to look back at
 * what was done and ahead at what is planned. Opens on the current week; a wide screen shows
 * the weeks before and after it as well. Weekends are tinted.
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
      // Centre the current week: on a phone it fills the strip, on a wide screen three weeks sit side by side.
      const week = el.children[current] as HTMLElement | undefined;
      if (week) el.scrollLeft = week.offsetLeft - (el.clientWidth - week.clientWidth) / 2;
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
        <div key={week[0].day} className="w-full shrink-0 snap-center p-3 lg:w-1/3">
          <div className={cx("caps mb-2 text-center", i === current && "text-accent")}>
            {i === current ? "Цей тиждень" : i === current - 1 ? "Минулий тиждень" : i === current + 1 ? "Наступний тиждень" : `${fmtDate(week[0].day)} – ${fmtDate(week[6].day)}`}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {week.map((d, j) => {
              // One rule for every week: the past is quiet, today is ringed, the future is plain.
              const past = d.day < today;
              const isToday = d.day === today;
              return (
              <Link
                key={d.day}
                href={`/calendar?d=${d.day}`}
                // Saturday and Sunday sit on a slightly lighter column, so the week reads at a glance.
                className={cx("flex flex-col items-center gap-1.5 rounded-xl py-1.5", j >= 5 && "bg-white/[0.045]")}
                aria-label={`${fmtDate(d.day)}: ${d.done ? "силове виконано" : d.planned ? "заплановано" : "без силового"}${d.sessions ? `, сесій за день: ${d.sessions}` : ""}. Відкрити в календарі`}
              >
                <span className={cx("text-[11px] font-semibold", isToday ? "text-accent" : past ? "text-muted/60" : "text-muted")}>{WEEKDAYS[j]}</span>
                <span
                  className={cx(
                    "num grid size-9 place-items-center rounded-full text-sm font-semibold",
                    d.done
                      ? cx("bg-accent text-accent-ink", past && "opacity-70")
                      : isToday
                        ? "bg-surface-3 text-ink"
                        : past
                          ? cx("text-muted/50", d.planned && "ring-1 ring-warning/50")
                          : d.planned
                            ? "bg-surface-2 text-ink ring-2 ring-accent/50"
                            : "bg-surface-2 text-ink-2",
                    isToday && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
                  )}
                >
                  {d.done ? <Check size={17} strokeWidth={3} /> : Number(d.day.slice(8))}
                </span>
                <SessionDots count={d.sessions} dim={past} />
              </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
