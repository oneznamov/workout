import Link from "next/link";
import { Activity, Bike, ChevronRight, Flame, Footprints, Heart, PersonStanding } from "lucide-react";
import type { CardioSession } from "@/lib/cardio";
import { CARDIO_LABEL, CARDIO_TONE, paceLabel, type CardioKind } from "@/lib/cardio-kinds";
import { cx, fmtDateLong, fmtDuration, fmtNum, fmtTime } from "@/lib/format";

export const CARDIO_ICON: Record<CardioKind, typeof Bike> = { run: Footprints, cycle: Bike, walk: PersonStanding, other: Activity };
const BG: Record<CardioKind, string> = { run: "bg-run/20", cycle: "bg-cycle/20", walk: "bg-activity/20", other: "bg-heart/20" };

export function CardioRow({ s }: { s: CardioSession }) {
  const Icon = CARDIO_ICON[s.kind];
  const pace = paceLabel(s.kind, s.distanceM, s.durationSec);
  const headline = s.distanceM && s.distanceM > 50 ? `${fmtNum(s.distanceM / 1000, 2)} км` : fmtDuration(s.durationSec);
  return (
    <Link href={`/cardio/${s.id}`} className="card flex items-center gap-3.5 p-4 transition-colors hover:bg-surface-2">
      <span className={cx("grid size-11 shrink-0 place-items-center rounded-full", BG[s.kind], CARDIO_TONE[s.kind])}>
        <Icon size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">
          {CARDIO_LABEL[s.kind]}
          {s.manual && <span className="ml-2 text-xs font-medium text-muted">вручну</span>}
        </div>
        <div className={cx("num truncate text-[1.35rem] leading-tight font-semibold", CARDIO_TONE[s.kind])}>{headline}</div>
        <div className="tabular mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
          <span>
            {fmtDateLong(s.startAt)} · {fmtTime(s.startAt)}
          </span>
          {s.distanceM && s.distanceM > 50 ? <span>{fmtDuration(s.durationSec)}</span> : null}
          {pace && <span>{pace}</span>}
          {s.avgHr != null && (
            <span className="flex items-center gap-1">
              <Heart size={11} className="text-heart" /> {fmtNum(s.avgHr)}
            </span>
          )}
          {s.activeKcal != null && (
            <span className="flex items-center gap-1">
              <Flame size={11} className="text-activity" /> {fmtNum(s.activeKcal)} ккал
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={18} className="shrink-0 text-muted" />
    </Link>
  );
}
