import Link from "next/link";
import { ChevronRight, Dumbbell, Flame, Heart, LayoutTemplate } from "lucide-react";
import { cx, EXERCISES_FORMS, fmtDateLong, fmtDuration, fmtNum, fmtTime, plural, SETS_FORMS } from "@/lib/format";
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
