import Link from "next/link";
import { ChevronRight, Flame, Heart } from "lucide-react";
import { EXERCISES_FORMS, fmtDateLong, fmtDuration, fmtNum, fmtTime, plural, SETS_FORMS } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/labels";
import type { WorkoutListItem } from "@/lib/workouts";
import { Badge } from "../ui";

export function WorkoutRow({ w }: { w: WorkoutListItem }) {
  const duration = w.startedAt && w.endedAt ? (w.endedAt.getTime() - w.startedAt.getTime()) / 1000 : null;
  const when =
    w.status === "completed"
      ? `${fmtDateLong(w.startedAt)} · ${fmtTime(w.startedAt)}`
      : w.status === "in_progress"
        ? `Почато о ${fmtTime(w.startedAt)}`
        : w.status === "planned"
          ? w.scheduledFor
            ? fmtDateLong(w.scheduledFor)
            : "Без дати"
          : plural(w.exerciseCount, EXERCISES_FORMS);
  return (
    <Link href={`/workouts/${w.id}`} className="card flex items-center gap-3 p-4 transition-colors hover:bg-surface-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{w.name}</span>
          {w.status !== "completed" && (
            <Badge tone={w.status === "in_progress" ? "accent" : "neutral"}>{STATUS_LABEL[w.status]}</Badge>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted">{when}</div>
        <div className="tabular mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-2">
          {w.status !== "template" && <span>{plural(w.exerciseCount, EXERCISES_FORMS)}</span>}
          <span>{plural(w.setCount, SETS_FORMS)}</span>
          {duration != null && <span>{fmtDuration(duration)}</span>}
          {w.volume > 0 && <span>{fmtNum(w.volume)} кг</span>}
          {w.avgHr != null && (
            <span className="flex items-center gap-1">
              <Heart size={12} /> {fmtNum(w.avgHr)}
            </span>
          )}
          {w.activeKcal != null && (
            <span className="flex items-center gap-1">
              <Flame size={12} /> {fmtNum(w.activeKcal)} ккал
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={18} className="shrink-0 text-muted" />
    </Link>
  );
}

