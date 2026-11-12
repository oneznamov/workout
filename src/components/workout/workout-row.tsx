import Link from "next/link";
import { ChevronRight, Dumbbell, Flame, Heart, LayoutTemplate } from "lucide-react";
import { cx, dayOf, EXERCISES_FORMS, fmtDate, fmtDateLong, fmtDuration, fmtNum, fmtTime, plural, SETS_FORMS } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/labels";
import type { WorkoutListItem } from "@/lib/workouts";

/** One workout in a list: icon, name, the headline number, then the supporting details. */
export function WorkoutRow({ w }: { w: WorkoutListItem }) {
  // Active time: pauses are not counted.
  const duration = w.startedAt && w.endedAt ? Math.max(0, (w.endedAt.getTime() - w.startedAt.getTime()) / 1000 - w.pausedSec) : null;
  const when =
    w.status === "completed"
      ? `${fmtDateLong(w.startedAt)} · ${fmtTime(w.startedAt)}`
      : w.status === "in_progress"
        ? `Почато о ${fmtTime(w.startedAt)}`
        : w.status === "planned"
          ? w.scheduledFor
            ? fmtDateLong(w.scheduledFor)
            : "Без дати"
          : STATUS_LABEL.template;
  const Icon = w.status === "template" ? LayoutTemplate : Dumbbell;
  const headline =
    w.status === "completed" && duration != null
      ? fmtDuration(duration)
      : w.status === "in_progress"
        ? "Триває"
        : plural(w.exerciseCount, EXERCISES_FORMS);
  return (
    <Link href={`/workouts/${w.id}`} className="card flex items-center gap-3.5 p-4 transition-colors hover:bg-surface-2">
      <span
        className={cx(
          "grid size-11 shrink-0 place-items-center rounded-full",
          w.status === "planned" || w.status === "template" ? "bg-surface-2 text-strength" : "bg-strength/20 text-strength",
        )}
      >
        <Icon size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">{w.name}</div>
        <div className="num truncate text-[1.35rem] leading-tight font-semibold text-strength">{headline}</div>
        <div className="tabular mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
          <span>{when}</span>
          {w.status === "completed" && <span>{plural(w.setCount, SETS_FORMS)}</span>}
          {w.volume > 0 && <span>{fmtNum(w.volume)} кг</span>}
          {w.avgHr != null && (
            <span className="flex items-center gap-1">
              <Heart size={11} className="text-heart" /> {fmtNum(w.avgHr)}
            </span>
          )}
          {w.activeKcal != null && (
            <span className="flex items-center gap-1">
              <Flame size={11} className="text-activity" /> {fmtNum(w.activeKcal)} ккал
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={18} className="shrink-0 text-muted" />
    </Link>
  );
}

/** Desktop: planned workouts and templates as one compact list instead of big cards. */
export function WorkoutList({ rows, className }: { rows: WorkoutListItem[]; className?: string }) {
  return (
    <div className={cx("card divide-y divide-line overflow-hidden", className)}>
      {rows.map((w) => {
        const Icon = w.status === "template" ? LayoutTemplate : Dumbbell;
        return (
          <Link key={w.id} href={`/workouts/${w.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-strength">
              <Icon size={16} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{w.name}</span>
            {w.status === "planned" && (
              <span className="tabular shrink-0 text-sm text-ink-2">{w.scheduledFor ? fmtDateLong(w.scheduledFor) : "Без дати"}</span>
            )}
            <span className="tabular w-20 shrink-0 text-right text-sm text-muted">{plural(w.exerciseCount, EXERCISES_FORMS)}</span>
            <ChevronRight size={16} className="shrink-0 text-muted" />
          </Link>
        );
      })}
    </div>
  );
}

const HISTORY_COLS =
  "grid grid-cols-[minmax(0,1fr)_9.5rem_5.5rem_4.5rem_5.5rem_1rem] items-center gap-x-4 px-4 xl:grid-cols-[minmax(0,1fr)_9.5rem_5.5rem_4.5rem_5.5rem_3.5rem_5rem_1rem]";

/** Desktop: finished workouts as a table — one line each, numbers in columns that can be compared down the page. */
export function WorkoutTable({ rows, className }: { rows: WorkoutListItem[]; className?: string }) {
  const thisYear = dayOf().slice(0, 4);
  return (
    <div role="table" aria-label="Історія тренувань" className={cx("card overflow-hidden", className)}>
      <div role="row" className={cx(HISTORY_COLS, "caps border-b border-line py-2.5")}>
        <span role="columnheader">Тренування</span>
        <span role="columnheader">Дата</span>
        <span role="columnheader" className="text-right">Час</span>
        <span role="columnheader" className="text-right">Підходи</span>
        <span role="columnheader" className="text-right">Тоннаж</span>
        <span role="columnheader" className="hidden text-right xl:block">Пульс</span>
        <span role="columnheader" className="hidden text-right xl:block">Ккал</span>
        <span />
      </div>
      {rows.map((w) => {
        const duration = w.startedAt && w.endedAt ? Math.max(0, (w.endedAt.getTime() - w.startedAt.getTime()) / 1000 - w.pausedSec) : null;
        const sameYear = !w.startedAt || dayOf(w.startedAt).slice(0, 4) === thisYear;
        return (
          <Link
            key={w.id}
            role="row"
            href={`/workouts/${w.id}`}
            className={cx(HISTORY_COLS, "tabular border-b border-line py-3 text-sm transition-colors last:border-0 hover:bg-surface-2")}
          >
            <span role="cell" className="flex min-w-0 items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-strength/20 text-strength">
                <Dumbbell size={16} />
              </span>
              <span className="truncate text-[15px] font-semibold">{w.name}</span>
            </span>
            <span role="cell" className="truncate text-ink-2">
              {fmtDate(w.startedAt, sameYear ? { weekday: "short", day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" })}
              <span className="text-muted"> · {fmtTime(w.startedAt)}</span>
            </span>
            <span role="cell" className="num text-right text-[15px] font-semibold text-strength">{fmtDuration(duration)}</span>
            <span role="cell" className="text-right text-ink-2">{w.setCount}</span>
            <span role="cell" className="text-right text-ink-2">{w.volume > 0 ? `${fmtNum(w.volume)} кг` : "—"}</span>
            <span role="cell" className="hidden items-center justify-end gap-1 text-ink-2 xl:flex">
              {w.avgHr != null ? (
                <>
                  <Heart size={11} className="text-heart" /> {fmtNum(w.avgHr)}
                </>
              ) : (
                <span className="text-muted">—</span>
              )}
            </span>
            <span role="cell" className="hidden text-right text-ink-2 xl:block">{w.activeKcal != null ? fmtNum(w.activeKcal) : <span className="text-muted">—</span>}</span>
            <ChevronRight size={16} className="text-muted" />
          </Link>
        );
      })}
    </div>
  );
}
