import Link from "next/link";
import { Activity, Bike, ChevronRight, Flame, Footprints, Heart, PersonStanding } from "lucide-react";
import type { CardioSession } from "@/lib/cardio";
import { CARDIO_LABEL, CARDIO_TONE, paceLabel, type CardioKind } from "@/lib/cardio-kinds";
import { cx, fmtDate, fmtDateLong, fmtDuration, fmtNum, fmtTime } from "@/lib/format";

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

const CARDIO_COLS =
  "grid grid-cols-[minmax(0,1fr)_9.5rem_5.5rem_5.5rem_6.5rem_1rem] items-center gap-x-4 px-4 xl:grid-cols-[minmax(0,1fr)_9.5rem_5.5rem_5.5rem_6.5rem_3.5rem_5rem_1rem]";

/** Desktop: cardio history as a table. */
export function CardioTable({ rows, className }: { rows: CardioSession[]; className?: string }) {
  return (
    <div role="table" aria-label="Історія кардіо" className={cx("card overflow-hidden", className)}>
      <div role="row" className={cx(CARDIO_COLS, "caps border-b border-line py-2.5")}>
        <span role="columnheader">Вид</span>
        <span role="columnheader">Дата</span>
        <span role="columnheader" className="text-right">Дистанція</span>
        <span role="columnheader" className="text-right">Час</span>
        <span role="columnheader" className="text-right">Темп</span>
        <span role="columnheader" className="hidden text-right xl:block">Пульс</span>
        <span role="columnheader" className="hidden text-right xl:block">Ккал</span>
        <span />
      </div>
      {rows.map((s) => {
        const Icon = CARDIO_ICON[s.kind];
        return (
          <Link
            key={s.id}
            role="row"
            href={`/cardio/${s.id}`}
            className={cx(CARDIO_COLS, "tabular border-b border-line py-3 text-sm transition-colors last:border-0 hover:bg-surface-2")}
          >
            <span role="cell" className="flex min-w-0 items-center gap-3">
              <span className={cx("grid size-8 shrink-0 place-items-center rounded-full", BG[s.kind], CARDIO_TONE[s.kind])}>
                <Icon size={16} />
              </span>
              <span className="truncate text-[15px] font-semibold">
                {CARDIO_LABEL[s.kind]}
                {s.manual && <span className="ml-2 text-xs font-medium text-muted">вручну</span>}
              </span>
            </span>
            <span role="cell" className="truncate text-ink-2">
              {fmtDate(s.startAt, { weekday: "short", day: "numeric", month: "short" })}
              <span className="text-muted"> · {fmtTime(s.startAt)}</span>
            </span>
            <span role="cell" className={cx("num text-right text-[15px] font-semibold", CARDIO_TONE[s.kind])}>
              {s.distanceM && s.distanceM > 50 ? `${fmtNum(s.distanceM / 1000, 2)} км` : "—"}
            </span>
            <span role="cell" className="text-right text-ink-2">{fmtDuration(s.durationSec)}</span>
            <span role="cell" className="text-right text-ink-2">{paceLabel(s.kind, s.distanceM, s.durationSec) ?? "—"}</span>
            <span role="cell" className="hidden items-center justify-end gap-1 text-ink-2 xl:flex">
              {s.avgHr != null ? (
                <>
                  <Heart size={11} className="text-heart" /> {fmtNum(s.avgHr)}
                </>
              ) : (
                <span className="text-muted">—</span>
              )}
            </span>
            <span role="cell" className="hidden text-right text-ink-2 xl:block">{s.activeKcal != null ? fmtNum(s.activeKcal) : <span className="text-muted">—</span>}</span>
            <ChevronRight size={16} className="text-muted" />
          </Link>
        );
      })}
    </div>
  );
}
