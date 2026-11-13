"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { dayState, monthTitle, NO_MARK, type DayMark } from "@/lib/calendar-logic";
import { sectionOn } from "@/lib/config";
import { cx, fmtDate } from "@/lib/format";
import { MonthGrid } from "./calendar";
import { DayDisc } from "./day-marks";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const VIEW_KEY = "wk:weekview";

/**
 * The week at a glance — and the weeks around it: swipe (or scroll) sideways to look back at
 * what was done and ahead at what is planned. Opens on the current week; a wide screen shows
 * the weeks before and after it as well. The same card can show the whole month instead.
 * Today is the tinted tile; weekends sit on a slightly lighter column.
 */
export function WeekStrip({ weeks, today, current, marks }: { /** days of each week, Monday first */ weeks: string[][]; today: string; current: number; marks: Record<string, DayMark> }) {
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
  // The switch lives in the title row, which every view keeps free on the right — it never covers a day.
  const toggle = (
    <div role="group" aria-label="Що показувати" className="absolute top-2.5 right-2.5 z-10 flex rounded-full bg-surface-2 p-0.5 text-[11px] font-semibold">
      {(
        [
          [false, "Тиждень"],
          [true, "Місяць"],
        ] as const
      ).map(([value, label]) => (
        <button key={label} onClick={() => show(value)} aria-pressed={month === value} className={cx("rounded-full px-2.5 py-1", month === value ? "bg-surface-3 text-ink" : "text-muted")}>
          {label}
        </button>
      ))}
    </div>
  );
  const title = "caps mb-2 flex h-7 items-center pr-36 pl-1";
  if (month) {
    const m = today.slice(0, 7);
    return (
      <div className="card relative p-3">
        {toggle}
        <div className={cx(title, "text-accent")}>{monthTitle(m)}</div>
        <MonthGrid month={m} today={today} marks={marks} linkBase="/calendar" />
        {sectionOn("calendar") && (
          <Link href="/calendar" className="mt-2 block text-center text-xs text-accent">
            Увесь календар →
          </Link>
        )}
      </div>
    );
  }
  return (
    <div className="relative">
      {toggle}
      <div ref={strip} className="card flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none]" role="group" aria-label="Тижні: гортайте вбік">
        {weeks.map((week, i) => (
          <div key={week[0]} className="w-full shrink-0 snap-center p-3 lg:w-1/3">
            <div className={cx(title, "lg:pr-0", i === current && "text-accent")}>
              {i === current ? "Цей тиждень" : i === current - 1 ? "Минулий тиждень" : i === current + 1 ? "Наступний тиждень" : `${fmtDate(week[0])} – ${fmtDate(week[6])}`}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {week.map((day, j) => {
                const m = marks[day] ?? NO_MARK;
                const past = day < today;
                const isToday = day === today;
                const state = dayState(m, day, today);
                return (
                  <Link
                    key={day}
                    href={`/calendar?d=${day}`}
                    className={cx("flex flex-col items-center gap-1.5 rounded-xl py-2", isToday ? "bg-accent/15 ring-1 ring-accent/40 ring-inset" : j >= 5 && "bg-white/[0.045]")}
                    aria-current={isToday ? "date" : undefined}
                    aria-label={`${fmtDate(day)}${isToday ? ", сьогодні" : ""}: ${
                      state === "done" ? "силове виконано" : state === "planned" ? "заплановано" : state === "missed" ? "заплановане пропущено" : "без силового"
                    }${m.kinds.length ? `, сесій за день: ${m.kinds.length}` : ""}. Відкрити в календарі`}
                  >
                    <span className={cx("text-[11px] font-semibold", isToday ? "text-accent" : past ? "text-muted/60" : "text-muted")}>{WEEKDAYS[j]}</span>
                    <DayDisc day={day} state={state} kinds={m.kinds} today={isToday} past={past} check outline />
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
