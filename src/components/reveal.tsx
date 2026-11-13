"use client";

import { Children, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "@/lib/format";

/** Shows the first few of its children and a button for the next batch — a long list never loads the screen at once. */
export function Reveal({ children, first, step = first, more, moreClass }: { children: ReactNode; first: number; step?: number; /** the button's words, e.g. "Раніші тижні" */ more: string; moreClass?: string }) {
  const items = Children.toArray(children);
  const [shown, setShown] = useState(first);
  return (
    <>
      {items.slice(0, shown)}
      {shown < items.length && (
        <button onClick={() => setShown(shown + step)} className={cx("btn btn-ghost w-full", moreClass)}>
          <ChevronDown size={17} /> {more} · ще {items.length - shown}
        </button>
      )}
    </>
  );
}
