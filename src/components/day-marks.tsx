import { Check } from "lucide-react";
import { sessionSegments, type DayState, type SessionKind } from "@/lib/calendar-logic";
import { cx } from "@/lib/format";

const COLOR: Record<SessionKind, string> = { strength: "var(--accent)", run: "var(--c-run)", cycle: "var(--c-cycle)", walk: "var(--c-activity)", other: "var(--c-heart)" };

/** A ring cut into equal arcs, one per session, each in the colour of its kind. */
function ringOf(kinds: SessionKind[]) {
  const step = 360 / kinds.length;
  const gap = 9; // degrees of empty space between arcs
  const stops = kinds.flatMap((k, i) => [`transparent ${i * step}deg ${i * step + gap / 2}deg`, `${COLOR[k]} ${i * step + gap / 2}deg ${(i + 1) * step - gap / 2}deg`, `transparent ${(i + 1) * step - gap / 2}deg ${(i + 1) * step}deg`]);
  return `conic-gradient(from ${-gap / 2}deg, ${stops.join(", ")})`;
}

/**
 * The circle of a day — one mark, nothing hanging off it:
 * a filled circle is a session done, in the colour of its kind (strength, run, ride…);
 * several sessions in a day put a ring of arcs around it, one arc per session;
 * a thin accent ring is a planned day, a faded warning ring a missed one.
 * "Today" is not drawn here: it is the tile behind the day, so it never looks like "planned".
 */
export function DayDisc({
  day,
  state,
  kinds = [],
  today,
  past,
  check,
  outline,
  size = "md",
}: {
  day: string;
  state: DayState;
  /** every session done that day */
  kinds?: SessionKind[];
  today?: boolean;
  past?: boolean;
  /** a tick instead of the number once something is done */
  check?: boolean;
  /** an empty day still gets a hairline circle (the week strip) */
  outline?: boolean;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "size-8 text-[13px]" : "size-9 text-sm";
  const done = sessionSegments(kinds);
  if (done.length > 0) {
    const many = done.length > 1;
    return (
      <span className={cx("num relative grid place-items-center font-semibold", box)}>
        {many && <span className="absolute inset-0 rounded-full [mask:radial-gradient(farthest-side,transparent_calc(100%-3px),#000_calc(100%-2.5px))]" style={{ background: ringOf(done) }} />}
        <span className={cx("absolute grid place-items-center rounded-full text-accent-ink", many ? "inset-[5px]" : "inset-0")} style={{ background: COLOR[done[0]] }}>
          {check ? <Check size={many ? 14 : 17} strokeWidth={3} /> : Number(day.slice(8))}
        </span>
      </span>
    );
  }
  return (
    <span
      className={cx(
        "num grid place-items-center rounded-full font-semibold",
        box,
        state === "planned" && "border-2 border-accent/80 text-ink",
        state === "missed" && "border-2 border-warning/40 text-muted",
        state === "none" && cx(today ? "font-bold text-accent" : past ? "text-muted/70" : "text-ink-2", outline && "border border-line"),
      )}
    >
      {Number(day.slice(8))}
    </span>
  );
}
