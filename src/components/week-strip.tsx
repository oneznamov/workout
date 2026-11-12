"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, Rows3 } from "lucide-react";
import { monthTitle, type DayMark } from "@/lib/calendar-logic";
import { cx, fmtDate } from "@/lib/format";
import { MonthGrid } from "./calendar";
import { SessionDots } from "./session-dots";

/** `sessions` — everything done that day, strength and cardio together. */
export type StripDay = { day: string; done: boolean; planned: boolean; sessions: number };

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const VIEW_KEY = "wk:weekview";

/**
 * The week at a glance — and the weeks around it: swipe (or scroll) sideways to look back at
 * what was done and ahead at what is planned. Opens on the current week; a wide screen shows
 * the weeks before and after it as well. Weekends are tinted.
 */
export function WeekStrip({ weeks, today, current, marks }: { weeks: StripDay[][]; today: string; current: number; /** with these the card can also show the month */ marks?: Record<string, DayMark> }) {
  const strip = useRef<HTMLDivElement>(null);
  // Week or month: the athlete's choice, remembered on this device.
  const [month, setMonth] = useState(false);
  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        setMonth(localStorage.getItem(VIEW_KEY) === "month");
      } catch {
        /* storage blocked — the week it is */
      }
    });
  }, []);
  const show = (next: boolean) => {
    setMonth(next);
    try {
      localStorage.setItem(VIEW_KEY, next ? "month" : "week");
    } catch {
      /* ignore */
    }
  };
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
  }, [current, month]);
  const toggle = marks && (
    <button
      onClick={() => show(!month)}
      aria-label={month ? "Показати тиждень" : "Показати місяць"}
      title={month ? "Показати тиждень" : "Показати місяць"}
      className="absolute top-2 right-2 z-10 grid size-8 place-items-center rounded-full bg-surface-2 text-ink-2 hover:text-ink"
    >
      {month ? <Rows3 size={16} /> : <CalendarDays size={16} />}
    </button>
  );
  if (month && marks) {
    const m = today.slice(0, 7);
    return (
      <div className="card relative p-3">
        {toggle}
        <div className="caps mb-2 text-center text-accent first-letter:uppercase">{monthTitle(m)}</div>
        <MonthGrid month={m} today={today} marks={marks} linkBase="/calendar" />
        <Link href="/calendar" className="mt-2 block text-center text-xs text-accent">
          Увесь календар →
        </Link>
      </div>
    );
  }
  return (
    <div className="relative">
    {toggle}
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
    </div>
  );
}
