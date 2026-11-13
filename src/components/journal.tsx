import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, Flame, Heart } from "lucide-react";
import type { CardioSession } from "@/lib/cardio";
import { CARDIO_LABEL, CARDIO_TONE, paceLabel, type CardioKind } from "@/lib/cardio-kinds";
import { cx, fmtDate, fmtDuration, fmtNum, fmtTime } from "@/lib/format";
import { workoutKind } from "@/lib/workout-kind";
import type { WorkoutListItem } from "@/lib/workouts";
import { CARDIO_ICON } from "./cardio/cardio-row";
import { BodyIcon } from "./workout/body-icon";
import { EffortTag } from "./workout/effort";

/**
 * The journal: a week with its totals, a line of days down the side, and on each day what
 * was done — short cards with the one number that matters first.
 */
export function JournalWeek({ title, stats, children }: { title: string; /** the week in a few numbers */ stats: string[]; children: ReactNode }) {
  return (
    <section>
      <h3 className="px-1 text-[1.1rem] font-bold first-letter:uppercase">{title}</h3>
      {stats.length > 0 && (
        <ul className="num mt-1.5 flex flex-wrap gap-1.5">
          {stats.map((s) => (
            <li key={s} className="rounded-full bg-surface px-3 py-1 text-[13px] text-ink-2">
              {s}
            </li>
          ))}
        </ul>
      )}
      <ol className="relative mt-3 ml-2 space-y-4 border-l border-line pl-5">{children}</ol>
    </section>
  );
}

/** One day on the journal's line. `label` is the element that names the day — plain text or a button. */
export function JournalDay({ day, today, label, children }: { day: string; today: string; label?: ReactNode; children: ReactNode }) {
  return (
    <li className="relative">
      <span
        className={cx("absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-plane", day === today ? "bg-accent" : day < today ? "bg-surface-3" : "border border-accent/80 bg-plane")}
        aria-hidden="true"
      />
      <div className="mb-2 flex items-baseline gap-2 text-sm font-semibold">
        {label ?? <span className="first-letter:uppercase">{fmtDate(day, { weekday: "long", day: "numeric", month: "long" })}</span>}
        {day === today && <span className="font-normal text-accent">сьогодні</span>}
      </div>
      <div className="grid gap-2">{children}</div>
    </li>
  );
}

const stat = "flex items-center gap-1";

/** A finished (or running) strength workout as a journal line: how long, how much, how it felt. */
export function JournalWorkout({ w }: { w: WorkoutListItem }) {
  const kind = workoutKind(w.muscles);
  // Active time: pauses are not counted.
  const duration = w.startedAt && w.endedAt ? Math.max(0, (w.endedAt.getTime() - w.startedAt.getTime()) / 1000 - w.pausedSec) : null;
  return (
    <Link href={`/workouts/${w.id}`} className="card flex items-center gap-3 p-3 transition-colors hover:bg-surface-2">
      <BodyIcon kind={kind} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[15px] font-semibold">{w.name}</span>
          <span className="shrink-0 text-xs text-muted">{kind.label}</span>
          {w.startedAt && <span className="num ml-auto shrink-0 text-xs text-muted">{fmtTime(w.startedAt)}</span>}
        </div>
        <div className="tabular mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-ink-2">
          <span className="font-semibold text-strength">{w.status === "in_progress" ? "Триває" : fmtDuration(duration)}</span>
          {w.volume > 0 && <span>{fmtNum(w.volume)} кг</span>}
          {w.avgHr != null && (
            <span className={stat}>
              <Heart size={12} className="text-heart" /> {fmtNum(w.avgHr)}
            </span>
          )}
          {w.activeKcal != null && (
            <span className={stat}>
              <Flame size={12} className="text-activity" /> {fmtNum(w.activeKcal)} ккал
            </span>
          )}
          {w.effort != null && <EffortTag value={w.effort} />}
        </div>
      </div>
      <ChevronRight size={18} className="shrink-0 text-muted" />
    </Link>
  );
}

const CARDIO_BG: Record<CardioKind, string> = { run: "bg-run/20", cycle: "bg-cycle/20", walk: "bg-activity/20", other: "bg-heart/20" };

/** A run, ride or walk as a journal line: the distance first, then time, pace and pulse. */
export function JournalCardio({ s }: { s: CardioSession }) {
  const Icon = CARDIO_ICON[s.kind];
  const far = Boolean(s.distanceM && s.distanceM > 50);
  const pace = paceLabel(s.kind, s.distanceM, s.durationSec);
  return (
    <Link href={`/cardio/${s.id}`} className="card flex items-center gap-3 p-3 transition-colors hover:bg-surface-2">
      <span className={cx("grid size-10 shrink-0 place-items-center rounded-2xl", CARDIO_BG[s.kind], CARDIO_TONE[s.kind])}>
        <Icon size={19} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[15px] font-semibold">{CARDIO_LABEL[s.kind]}</span>
          {s.manual && <span className="shrink-0 text-xs text-muted">вручну</span>}
          <span className="num ml-auto shrink-0 text-xs text-muted">{fmtTime(s.startAt)}</span>
        </div>
        <div className="tabular mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-ink-2">
          <span className={cx("font-semibold", CARDIO_TONE[s.kind])}>{far ? `${fmtNum(s.distanceM! / 1000, 2)} км` : fmtDuration(s.durationSec)}</span>
          {far && <span>{fmtDuration(s.durationSec)}</span>}
          {pace && <span>{pace}</span>}
          {s.avgHr != null && (
            <span className={stat}>
              <Heart size={12} className="text-heart" /> {fmtNum(s.avgHr)}
            </span>
          )}
          {s.activeKcal != null && (
            <span className={stat}>
              <Flame size={12} className="text-activity" /> {fmtNum(s.activeKcal)} ккал
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={18} className="shrink-0 text-muted" />
    </Link>
  );
}
