import Link from "next/link";
import { ChevronRight, Flame, Heart } from "lucide-react";
import { cx, dayOf, EXERCISES_FORMS, fmtDate, fmtDateLong, fmtDuration, fmtNum, fmtTime, plural, SETS_FORMS } from "@/lib/format";
import { workoutKind } from "@/lib/workout-kind";
import type { WorkoutListItem } from "@/lib/workouts";
import { BodyIcon } from "./body-icon";
import { EffortTag } from "./effort";
import { RescheduleButtons } from "./reschedule";

const DAY_FORMS: [string, string, string] = ["день", "дні", "днів"];
const dayNumber = (day: string) => Date.parse(`${day}T12:00:00Z`) / 86400000;

/** "сьогодні", "завтра", "через 3 дні", "прострочено" (the date itself is on the calendar tile). */
function whenPlanned(day: string, today: string, sick: boolean) {
  const diff = Math.round(dayNumber(day) - dayNumber(today));
  // While the athlete is ill a missed day is not a failure — it just waits.
  if (diff < 0 && sick) return { text: "на паузі", tone: "text-muted" };
  if (diff === 0) return { text: "сьогодні", tone: "text-accent" };
  if (diff === 1) return { text: "завтра", tone: "text-ink-2" };
  if (diff > 1) return { text: `через ${plural(diff, DAY_FORMS)}`, tone: "text-muted" };
  return { text: "прострочено", tone: "text-warning" };
}

const KindTag = ({ label }: { label: string }) => <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-2">{label}</span>;

/**
 * A workout that is still ahead: outlined rather than filled, with a calendar tile for the
 * date — so it never reads as something already done.
 */
export function PlannedCard({ w, sick = false }: { w: WorkoutListItem; sick?: boolean }) {
  const kind = workoutKind(w.muscles);
  const today = dayOf();
  const when = w.scheduledFor ? whenPlanned(w.scheduledFor, today, sick) : null;
  const overdue = Boolean(w.scheduledFor && w.scheduledFor < today);
  return (
    <div>
    <Link
      href={`/workouts/${w.id}`}
      className="flex items-center gap-3.5 rounded-[20px] border border-dashed border-accent/45 bg-accent/[0.05] p-3.5 transition-colors hover:bg-accent/10"
    >
      <span className="flex w-[3.25rem] shrink-0 flex-col overflow-hidden rounded-xl bg-surface-2 text-center">
        <span className="bg-accent py-0.5 text-[10px] leading-4 font-bold tracking-wide text-accent-ink uppercase">
          {w.scheduledFor ? fmtDate(w.scheduledFor, { month: "short" }).replace(".", "") : "план"}
        </span>
        <span className="num py-1 text-[1.35rem] leading-7 font-bold">{w.scheduledFor ? fmtDate(w.scheduledFor, { day: "numeric" }) : "—"}</span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">{w.name}</div>
        <div className="truncate text-xs first-letter:uppercase">
          {w.scheduledFor ? (
            <>
              <span className="text-ink-2">{fmtDate(w.scheduledFor, { weekday: "long" })}</span>
              <span className={cx("ml-1.5", when!.tone)}>· {when!.text}</span>
            </>
          ) : (
            <span className="text-muted">Без дати</span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <KindTag label={kind.label} />
          <span>{plural(w.exerciseCount, EXERCISES_FORMS)}</span>
          {w.expectedEffort != null && <EffortTag value={w.expectedEffort} forecast />}
        </div>
      </div>
      <BodyIcon kind={kind} size={40} className="bg-transparent" />
      <ChevronRight size={18} className="shrink-0 text-muted" />
    </Link>
    {overdue && <RescheduleButtons id={w.id} />}
    </div>
  );
}

/** One workout in a list: pictogram, name, the headline number, then the supporting details. */
export function WorkoutRow({ w, sick = false }: { w: WorkoutListItem; sick?: boolean }) {
  if (w.status === "planned") return <PlannedCard w={w} sick={sick} />;
  const kind = workoutKind(w.muscles);
  // Active time: pauses are not counted.
  const duration = w.startedAt && w.endedAt ? Math.max(0, (w.endedAt.getTime() - w.startedAt.getTime()) / 1000 - w.pausedSec) : null;
  const when =
    w.status === "completed" ? `${fmtDateLong(w.startedAt)} · ${fmtTime(w.startedAt)}` : w.status === "in_progress" ? `Почато о ${fmtTime(w.startedAt)}` : "Шаблон";
  const headline =
    w.status === "completed" && duration != null ? fmtDuration(duration) : w.status === "in_progress" ? "Триває" : plural(w.exerciseCount, EXERCISES_FORMS);
  return (
    <Link href={`/workouts/${w.id}`} className="card flex items-center gap-3.5 p-4 transition-colors hover:bg-surface-2">
      <BodyIcon kind={kind} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold">{w.name}</span>
          <KindTag label={kind.label} />
        </div>
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
          {w.effort != null && <EffortTag value={w.effort} />}
        </div>
      </div>
      <ChevronRight size={18} className="shrink-0 text-muted" />
    </Link>
  );
}

/** Desktop: templates as one compact list instead of big cards. */
export function WorkoutList({ rows, className }: { rows: WorkoutListItem[]; className?: string }) {
  return (
    <div className={cx("card divide-y divide-line overflow-hidden", className)}>
      {rows.map((w) => {
        const kind = workoutKind(w.muscles);
        return (
          <Link key={w.id} href={`/workouts/${w.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2">
            <BodyIcon kind={kind} size={36} />
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{w.name}</span>
            <KindTag label={kind.label} />
            <span className="tabular w-20 shrink-0 text-right text-sm text-muted">{plural(w.exerciseCount, EXERCISES_FORMS)}</span>
            <ChevronRight size={16} className="shrink-0 text-muted" />
          </Link>
        );
      })}
    </div>
  );
}

const HISTORY_COLS =
  "grid grid-cols-[minmax(0,1fr)_9.5rem_5.5rem_4.5rem_5.5rem_1rem] items-center gap-x-4 px-4 xl:grid-cols-[minmax(0,1fr)_9.5rem_5.5rem_4.5rem_5.5rem_4.5rem_3.5rem_5rem_1rem]";

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
        <span role="columnheader" className="hidden text-right xl:block">Зусилля</span>
        <span role="columnheader" className="hidden text-right xl:block">Пульс</span>
        <span role="columnheader" className="hidden text-right xl:block">Ккал</span>
        <span />
      </div>
      {rows.map((w) => {
        const kind = workoutKind(w.muscles);
        const duration = w.startedAt && w.endedAt ? Math.max(0, (w.endedAt.getTime() - w.startedAt.getTime()) / 1000 - w.pausedSec) : null;
        const sameYear = !w.startedAt || dayOf(w.startedAt).slice(0, 4) === thisYear;
        return (
          <Link
            key={w.id}
            role="row"
            href={`/workouts/${w.id}`}
            className={cx(HISTORY_COLS, "tabular border-b border-line py-2.5 text-sm transition-colors last:border-0 hover:bg-surface-2")}
          >
            <span role="cell" className="flex min-w-0 items-center gap-3">
              <BodyIcon kind={kind} size={38} />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold">{w.name}</span>
                <span className="block truncate text-xs text-muted">{kind.label}</span>
              </span>
            </span>
            <span role="cell" className="truncate text-ink-2">
              {fmtDate(w.startedAt, sameYear ? { weekday: "short", day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" })}
              <span className="text-muted"> · {fmtTime(w.startedAt)}</span>
            </span>
            <span role="cell" className="num text-right text-[15px] font-semibold text-strength">{fmtDuration(duration)}</span>
            <span role="cell" className="text-right text-ink-2">{w.setCount}</span>
            <span role="cell" className="text-right text-ink-2">{w.volume > 0 ? `${fmtNum(w.volume)} кг` : "—"}</span>
            <span role="cell" className="hidden justify-end text-ink-2 xl:flex">{w.effort != null ? <EffortTag value={w.effort} /> : <span className="text-muted">—</span>}</span>
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
