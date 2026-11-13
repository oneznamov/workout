"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { calendarMonthAction } from "@/lib/actions";
import type { DayItems } from "@/lib/calendar";
import { dayState, mark, monthTitle, monthWeeks, NO_MARK, shiftMonth, type DayMark } from "@/lib/calendar-logic";
import { addDays, cx, fmtDate, fmtNum, weekStart } from "@/lib/format";
import { DayDisc } from "./day-marks";
import { JournalCardio, JournalDay, JournalWorkout } from "./journal";
import { PlanSheet } from "./workout/plan-sheet";
import { PlannedCard } from "./workout/workout-row";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

/**
 * A month as a grid of days — only the weeks the month touches. A filled circle is a session
 * done (its colour is the kind), a ring of arcs around it means several that day, a thin ring
 * is planned (faded to a warning once missed). Today is the tinted tile, the chosen day the
 * outlined one.
 * With `linkBase` the days are links (the home card); with `onSelect` they pick a day in place.
 */
export function MonthGrid({
  month,
  today,
  marks,
  selected,
  onSelect,
  linkBase,
}: {
  month: string;
  today: string;
  marks: Record<string, DayMark>;
  selected?: string;
  onSelect?: (day: string) => void;
  linkBase?: string;
}) {
  return (
    <div className="grid grid-cols-7 gap-0.5 text-center">
      {WEEKDAYS.map((d, i) => (
        <span key={d} className={cx("pb-1 text-[11px] font-semibold", i >= 5 ? "text-ink-2" : "text-muted")}>
          {d}
        </span>
      ))}
      {monthWeeks(month).map((day) => {
        const m = marks[day] ?? NO_MARK;
        const outside = day.slice(0, 7) !== month;
        const isToday = day === today;
        const picked = selected === day;
        const label = `${fmtDate(day, { weekday: "long", day: "numeric", month: "long" })}${isToday ? ", сьогодні" : ""}: ${
          [m.done && `виконано ${m.done}`, m.planned && `заплановано ${m.planned}`, m.cardio && `кардіо ${m.cardio}`].filter(Boolean).join(", ") || "нічого"
        }`;
        const body = <DayDisc day={day} state={dayState(m, day, today)} kinds={m.kinds} today={isToday} past={day < today} size="sm" />;
        const cls = cx(
          "grid place-items-center rounded-xl py-1",
          outside && "opacity-35",
          picked ? cx("ring-2 ring-ink/80 ring-inset", isToday ? "bg-accent/15" : "bg-surface-2") : isToday && "bg-accent/15 ring-1 ring-accent/40 ring-inset",
        );
        return linkBase ? (
          <Link key={day} href={`${linkBase}?d=${day}`} aria-label={label} aria-current={isToday ? "date" : undefined} className={cls}>
            {body}
          </Link>
        ) : (
          <button key={day} type="button" onClick={() => onSelect?.(day)} aria-label={label} aria-pressed={picked} aria-current={isToday ? "date" : undefined} className={cls}>
            {body}
          </button>
        );
      })}
    </div>
  );
}

/** Everything on one day: diary workouts, then cardio. */
function DayEntries({ items }: { items: DayItems }) {
  return (
    <div className="grid grid-cols-1 gap-3">
      {items.workouts.map((w) => (w.status === "planned" ? <PlannedCard key={w.id} w={w} /> : <JournalWorkout key={w.id} w={w} />))}
      {items.cardio.map((c) => (
        <JournalCardio key={c.id} s={c} />
      ))}
    </div>
  );
}

function marksOf(days: Record<string, DayItems> | undefined) {
  const marks: Record<string, DayMark> = {};
  for (const [d, items] of Object.entries(days ?? {})) {
    for (const w of items.workouts) mark(marks, d, w.status === "completed" ? "done" : "planned");
    for (const c of items.cardio) mark(marks, d, "cardio", c.kind);
  }
  return marks;
}

/**
 * The calendar page: a month to look around in and, right under it, the chosen day. Months
 * turn in place — arrows or a sideways swipe — without reloading the page; the neighbours
 * are fetched ahead, so turning is instant.
 */
export function CalendarView({ month: firstMonth, today, initialDay, days }: { month: string; today: string; initialDay: string; days: Record<string, DayItems> }) {
  const [month, setMonth] = useState(firstMonth);
  const [day, setDay] = useState(initialDay);
  const [loaded, setLoaded] = useState<Record<string, Record<string, DayItems>>>({});
  const [failed, setFailed] = useState(false);
  const [planning, setPlanning] = useState(false);
  const asked = useRef(new Set([firstMonth]));
  const touch = useRef<{ x: number; y: number } | null>(null);

  const load = (m: string, current: boolean) => {
    if (asked.current.has(m)) return;
    asked.current.add(m);
    calendarMonthAction(m).then(
      (d) => setLoaded((all) => ({ ...all, [m]: d })),
      () => {
        asked.current.delete(m);
        if (current) setFailed(true);
      },
    );
  };
  // This month first, then the ones either side of it.
  useEffect(() => {
    load(month, true);
    load(shiftMonth(month, -1), false);
    load(shiftMonth(month, 1), false);
  }, [month]);

  const open = (d: string) => {
    setDay(d);
    setFailed(false);
    setMonth(d.slice(0, 7));
    // Keep the address in step, so a refresh or "back" returns to the same day.
    window.history.replaceState(null, "", `/calendar?d=${d}`);
  };
  const turn = (delta: number) => {
    const m = shiftMonth(month, delta);
    open(m === today.slice(0, 7) ? today : `${m}-01`);
  };

  const data = month === firstMonth ? days : loaded[month];
  const marks = marksOf(data);
  const inMonth = Object.entries(marks).filter(([d]) => d.slice(0, 7) === month);
  const sum = (pick: (m: DayMark, d: string) => number) => inMonth.reduce((a, [d, m]) => a + pick(m, d), 0);
  const summary = [
    [sum((m) => m.done), "силових"],
    [sum((m) => m.cardio), "кардіо"],
    [sum((m, d) => (d >= today ? m.planned : 0)), "попереду"],
  ]
    .filter(([n]) => Number(n) > 0)
    .map(([n, what]) => `${what}: ${n}`)
    .join(" · ");
  const items = data?.[day] ?? { workouts: [], cardio: [] };
  const count = items.workouts.length + items.cardio.length;
  const when = day === today ? "сьогодні" : day === addDays(today, 1) ? "завтра" : day === addDays(today, -1) ? "учора" : null;
  // The week of the chosen day, as a journal under it.
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart(day), i));
  const has = (d: string) => (data?.[d]?.workouts.length ?? 0) + (data?.[d]?.cardio.length ?? 0) > 0;
  const rest = week.filter((d) => d !== day && has(d));
  const inWeek = week.flatMap((d) => (data?.[d] ? [data[d]] : []));
  const doneInWeek = inWeek.flatMap((i) => i.workouts.filter((w) => w.status === "completed"));
  const weekKg = doneInWeek.reduce((a, w) => a + w.volume, 0);
  const weekKm = inWeek.reduce((a, i) => a + i.cardio.reduce((b, c) => b + (c.distanceM ?? 0), 0), 0) / 1000;
  const weekSessions = doneInWeek.length + inWeek.reduce((a, i) => a + i.cardio.length, 0);
  const weekSummary = [weekSessions > 0 && `виконано: ${weekSessions}`, weekKg > 0 && `${fmtNum(weekKg)} кг`, weekKm >= 0.1 && `${fmtNum(weekKm, 1)} км`].filter(Boolean).join(" · ");

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start lg:gap-6">
      <section
        className="card touch-pan-y p-3"
        aria-busy={!data}
        onTouchStart={(e) => {
          touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }}
        onTouchEnd={(e) => {
          const from = touch.current;
          touch.current = null;
          if (!from) return;
          const dx = e.changedTouches[0].clientX - from.x;
          const dy = e.changedTouches[0].clientY - from.y;
          if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.5) turn(dx < 0 ? 1 : -1);
        }}
      >
        <div className="mb-2.5 flex items-center gap-2 pl-1">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-[17px] leading-tight font-bold">
              {monthTitle(month)}
              {!data && !failed && <Loader2 size={15} className="animate-spin text-muted" aria-label="Завантаження" />}
            </h2>
            <p className="h-4 truncate text-xs text-muted">{failed ? "Не вдалося завантажити місяць" : data ? summary || "Поки нічого" : ""}</p>
          </div>
          {day !== today && (
            <button onClick={() => open(today)} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-accent">
              Сьогодні
            </button>
          )}
          <button onClick={() => turn(-1)} aria-label="Попередній місяць" className="icon-btn size-9 bg-surface-2 text-ink">
            <ChevronLeft size={19} />
          </button>
          <button onClick={() => turn(1)} aria-label="Наступний місяць" className="icon-btn size-9 bg-surface-2 text-ink">
            <ChevronRight size={19} />
          </button>
        </div>
        <MonthGrid month={month} today={today} marks={marks} selected={day} onSelect={open} />
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-line pt-2.5 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-accent" /> виконано
          </span>
          <span className="flex items-center gap-1.5">
            <span className="grid size-3 place-items-center rounded-full border-[1.5px] border-accent">
              <span className="size-1 rounded-full bg-accent" />
            </span>
            кілька за день
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border-[1.5px] border-accent/80" /> заплановано
          </span>
        </div>
      </section>

      <div className="space-y-6">
        {/* The chosen day first… */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3 px-1">
            <h2 className="text-[1.2rem] leading-tight font-bold tracking-tight first-letter:uppercase">{fmtDate(day, { weekday: "long", day: "numeric", month: "long" })}</h2>
            {when && <span className="shrink-0 text-sm text-accent">{when}</span>}
          </div>
          {!data ? (
            failed ? (
              <button
                onClick={() => {
                  setFailed(false);
                  load(month, true);
                }}
                className="btn btn-ghost w-full"
              >
                Спробувати ще раз
              </button>
            ) : (
              <div className="h-[4.5rem] animate-pulse rounded-[20px] bg-surface" />
            )
          ) : (
            <>
              {count > 0 && <DayEntries items={items} />}
              {count === 0 && <p className="px-1 text-sm text-muted">{day >= today ? "На цей день нічого не заплановано." : "Цього дня тренувань не було."}</p>}
              {day >= today && (
                <button onClick={() => setPlanning(true)} className={cx("btn w-full", count === 0 ? "btn-primary" : "btn-ghost")}>
                  <CalendarPlus size={17} /> Запланувати на цей день
                </button>
              )}
            </>
          )}
        </section>

        {/* …then the rest of its week as a journal: a line of days, each with what was done or is planned. */}
        {data && rest.length > 0 && (
          <section aria-label="Решта тижня">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
              <h2 className="text-[15px] font-bold">
                Тиждень {fmtDate(week[0], { day: "numeric" })}–{fmtDate(week[6])}
              </h2>
              <p className="num text-xs text-muted">{weekSummary}</p>
            </div>
            <ol className="relative ml-2 space-y-4 border-l border-line pl-5">
              {rest.map((d) => (
                <JournalDay
                  key={d}
                  day={d}
                  today={today}
                  label={
                    <button onClick={() => open(d)} className="first-letter:uppercase">
                      {fmtDate(d, { weekday: "long", day: "numeric", month: "long" })}
                    </button>
                  }
                >
                  <DayEntries items={data[d]} />
                </JournalDay>
              ))}
            </ol>
          </section>
        )}
      </div>
      {planning && <PlanSheet key={day} day={day} onClose={() => setPlanning(false)} />}
    </div>
  );
}
