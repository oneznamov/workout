"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "@/lib/format";

/** Whether a card is folded; remembered on this device under `key`, for every place the card appears. */
export function useFold(key: string) {
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        setFolded(localStorage.getItem(key) === "1");
      } catch {
        /* storage blocked — stay open */
      }
    });
  }, [key]);
  const toggle = () => {
    const next = !folded;
    setFolded(next);
    try {
      localStorage.setItem(key, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };
  return [folded, toggle] as const;
}

/**
 * A card that folds to its title with one tap — for things worth having on the page but not
 * always worth the space: notes from the watch, the timeline, records.
 */
export function Fold({
  id,
  title,
  icon,
  tone,
  summary,
  aside,
  className,
  children,
}: {
  /** storage key suffix: one fold state per kind of card */
  id: string;
  title: ReactNode;
  icon?: ReactNode;
  /** colour class of the title */
  tone?: string;
  /** shown next to the title while folded */
  summary?: ReactNode;
  /** stays at the right of the header while open */
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const [folded, toggle] = useFold(`wk:fold:${id}`);
  return (
    <section className={cx(className ?? "card", "p-4")}>
      <button onClick={toggle} aria-expanded={!folded} className={cx("flex w-full items-center gap-2 text-left text-[15px] font-semibold", tone)}>
        {icon}
        <span className="min-w-0 shrink truncate">{title}</span>
        {folded && summary ? <span className="min-w-0 flex-1 truncate pl-1 text-sm font-normal text-muted">{summary}</span> : <span className="flex-1" />}
        {!folded && aside}
        <ChevronDown size={17} className={cx("shrink-0 text-muted transition-transform", !folded && "rotate-180")} />
      </button>
      {!folded && <div className="mt-3">{children}</div>}
    </section>
  );
}
