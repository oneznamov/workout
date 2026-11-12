"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import type { CardioSession } from "@/lib/cardio";
import { monthGrid, monthTitle, NO_MARK, sessionsOn, shiftMonth, type DayMark } from "@/lib/calendar-logic";
import { cx, fmtDate } from "@/lib/format";
import type { WorkoutListItem } from "@/lib/workouts";
import { CardioRow } from "./cardio/cardio-row";
import { SessionDots } from "./week-strip";
import { PlanSheet } from "./workout/plan-sheet";
import { WorkoutRow } from "./workout/workout-row";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

/**
 * A month as a grid of days. Each day says what is on it: a filled circle — strength done,
 * a ring — planned, dots underneath — how many sessions there were (three or more turn hot).
 * With `linkBase` the days are links (the home widget); with `onSelect` they pick a day in place.
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
    <div className="grid grid-cols-7 gap-y-1 text-center">
      {WEEKDAYS.map((d, i) => (
        <span key={d} className={cx("pb-1 text-[11px] font-semibold", i >= 5 ? "text-ink-2" : "text-muted")}>
          {d}
        </span>
      ))}
      {monthGrid(month).map((day) => {
        const m = marks[day] ?? NO_MARK;
        const outside = day.slice(0, 7) !== month;
        const past = day < today;
        const isToday = day === today;
        const label = `${fmtDate(day, { weekday: "long", day: "numeric", month: "long" })}: ${
          [m.done && `виконано ${m.done}`, m.planned && `заплановано ${m.planned}`, m.cardio && `кардіо ${m.cardio}`].filter(Boolean).join(", ") || "нічого"
        }`;
        const body = (
          <>
            <span
              className={cx(
                "num grid size-9 place-items-center rounded-full text-sm font-semibold",
                m.done > 0
                  ? cx("bg-accent text-accent-ink", past && "opacity-80")
                  : m.planned > 0
                    ? cx("text-ink ring-2", past ? "ring-warning/50" : "ring-accent/60")
                    : past
                      ? "text-muted/70"
                      : "text-ink-2",
                isToday && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
                selected === day && "outline-2 outline-offset-2 outline-ink",
              )}
            >
              {Number(day.slice(8))}
            </span>
            <SessionDots count={sessionsOn(m)} />
          </>
        );
        const cls = cx("flex flex-col items-center gap-1 rounded-xl py-1", outside && "opacity-35");
        return linkBase ? (
          <Link key={day} href={`${linkBase}?d=${day}`} aria-label={label} className={cls}>
            {body}
          </Link>
        ) : (
          <button key={day} type="button" onClick={() => onSelect?.(day)} aria-label={label} aria-pressed={selected === day} className={cls}>
            {body}
          </button>
        );
      })}
    </div>
  );
}

export type DayItems = { workouts: WorkoutListItem[]; cardio: CardioSession[] };

/** The calendar page: a month to look around in, and under it everything about the chosen day. */
export function CalendarView({ month, today, initialDay, days }: { month: string; today: string; initialDay: string; days: Record<string, DayItems> }) {
  const [day, setDay] = useState(initialDay);
  const [planning, setPlanning] = useState(false);
  const marks: Record<string, DayMark> = {};
  for (const [d, items] of Object.entries(days)) {
    marks[d] = {
      done: items.workouts.filter((w) => w.status === "completed").length,
      planned: items.workouts.filter((w) => w.status !== "completed").length,
      cardio: items.cardio.length,
    };
  }
  const items = days[day] ?? { workouts: [], cardio: [] };
  const count = items.workouts.length + items.cardio.length;
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Link href={`/calendar?m=${shiftMonth(month, -1)}`} aria-label="Попередній місяць" className="icon-btn size-9 bg-surface-2 text-ink">
            <ChevronLeft size={19} />
          </Link>
          <h2 className="text-[17px] font-bold first-letter:uppercase">{monthTitle(month)}</h2>
          <Link href={`/calendar?m=${shiftMonth(month, 1)}`} aria-label="Наступний місяць" className="icon-btn size-9 bg-surface-2 text-ink">
            <ChevronRight size={19} />
          </Link>
        </div>
        <MonthGrid month={month} today={today} marks={marks} selected={day} onSelect={setDay} />
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-full bg-accent" /> виконано
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-full ring-2 ring-accent/60" /> заплановано
          </span>
          <span className="flex items-center gap-1.5">
            <SessionDots count={1} /> сесії за день
          </span>
          <span className="flex items-center gap-1.5">
            <SessionDots count={3} /> три й більше
          </span>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[1.35rem] font-bold tracking-tight first-letter:uppercase">{fmtDate(day, { weekday: "long", day: "numeric", month: "long" })}</h2>
            <p className="text-sm text-muted">{day === today ? "Сьогодні" : day < today ? "Минуло" : "Попереду"}{count > 0 ? ` · записів: ${count}` : ""}</p>
          </div>
          {day >= today && (
            <button onClick={() => setPlanning(true)} className="btn btn-primary btn-sm">
              <CalendarPlus size={16} /> Запланувати
            </button>
          )}
        </div>
        {count === 0 ? (
          <p className="rounded-[20px] border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            {day >= today ? "На цей день нічого не заплановано." : "Цього дня тренувань не було."}
          </p>
        ) : (
          <div className="grid gap-3">
            {items.workouts.map((w) => (
              <WorkoutRow key={w.id} w={w} />
            ))}
            {items.cardio.map((c) => (
              <CardioRow key={c.id} s={c} />
            ))}
          </div>
        )}
      </section>
      {planning && <PlanSheet key={day} day={day} onClose={() => setPlanning(false)} />}
    </div>
  );
}
