import Link from "next/link";
import { ChevronRight, Route } from "lucide-react";
import type { ProgramSnapshot } from "@/db/schema";
import { cx, fmtDate, plural } from "@/lib/format";
import { PROGRAM_STATUS_LABEL, programStatus, programWeek, programWeeks } from "@/lib/program-logic";
import type { ProgramListItem } from "@/lib/programs";

const WORKOUT_FORMS: [string, string, string] = ["тренування", "тренування", "тренувань"];
const WEEK_FORMS: [string, string, string] = ["тиждень", "тижні", "тижнів"];
const TONE = { active: "bg-accent text-accent-ink", upcoming: "bg-surface-3 text-ink-2", finished: "bg-surface-2 text-muted" };

/** A programme in a list: what stage it is, how far along, what comes next. */
export function ProgramCard({ p, today }: { p: ProgramListItem; today: string }) {
  const status = programStatus(p, today);
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  return (
    <Link href={`/programs/${p.id}`} className={cx("card block p-4 transition-colors hover:bg-surface-2", status === "active" && "ring-1 ring-accent/40")}>
      <div className="flex items-start gap-3">
        <span className={cx("grid size-10 shrink-0 place-items-center rounded-2xl", status === "active" ? "bg-accent/20 text-accent" : "bg-surface-2 text-muted")}>
          <Route size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold">{p.name}</span>
            <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", TONE[status])}>{PROGRAM_STATUS_LABEL[status]}</span>
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {fmtDate(p.startsOn)} – {fmtDate(p.endsOn)} · {plural(programWeeks(p), WEEK_FORMS)}
            {status === "active" && ` · зараз ${programWeek(p.startsOn, today)}-й`}
          </div>
        </div>
        <ChevronRight size={18} className="mt-2.5 shrink-0 text-muted" />
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <div className="num mt-1.5 flex justify-between gap-3 text-xs text-muted">
        <span>
          виконано <span className="font-semibold text-ink">{p.done}</span> з {plural(p.total, WORKOUT_FORMS)}
        </span>
        {p.next && <span>далі {fmtDate(p.next, { weekday: "short", day: "numeric", month: "short" })}</span>}
      </div>
    </Link>
  );
}

const SOURCE = { manual: "вручну", ai: "ШІ", claude: "Claude" };

/** How the programme changed over time: each entry opens to show what the programme looked like then. */
export function RevisionList({ revisions }: { revisions: { id: string; source: "manual" | "ai" | "claude"; summary: string; snapshot: ProgramSnapshot; createdAt: Date }[] }) {
  if (revisions.length === 0) return <p className="text-sm text-muted">Змін ще не було.</p>;
  return (
    <ol className="space-y-2">
      {revisions.map((r, i) => (
        <li key={r.id}>
          <details className="group rounded-2xl bg-surface-2">
            <summary className="flex cursor-pointer list-none items-start gap-3 p-3 [&::-webkit-details-marker]:hidden">
              <span className={cx("mt-1.5 size-2.5 shrink-0 rounded-full", i === 0 ? "bg-accent" : "bg-surface-3")} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm leading-snug">{r.summary}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {fmtDate(r.createdAt, { day: "numeric", month: "long", year: "numeric" })} · {SOURCE[r.source]} · {plural(r.snapshot.workouts.length, WORKOUT_FORMS)}
                </span>
              </span>
              <span className="mt-0.5 shrink-0 text-muted transition-transform group-open:rotate-90" aria-hidden="true">
                ›
              </span>
            </summary>
            <div className="space-y-3 border-t border-line p-3 text-sm">
              <p className="text-xs text-muted">
                Якою програма була тоді: «{r.snapshot.name}», {fmtDate(r.snapshot.startsOn)} – {fmtDate(r.snapshot.endsOn)}
              </p>
              {r.snapshot.forecast && <p className="text-ink-2">{r.snapshot.forecast}</p>}
              <ul className="space-y-2">
                {r.snapshot.workouts.map((w, j) => (
                  <li key={j}>
                    <div className="font-medium">
                      {w.date ? fmtDate(w.date, { weekday: "short", day: "numeric", month: "short" }) : "без дати"} · {w.name}
                      {w.status === "completed" && <span className="ml-2 text-xs font-normal text-accent">виконано</span>}
                    </div>
                    <div className="num text-xs leading-relaxed text-muted">{w.exercises.join(" · ") || "без вправ"}</div>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </li>
      ))}
    </ol>
  );
}
