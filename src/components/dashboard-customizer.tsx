"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, SlidersHorizontal } from "lucide-react";
import { saveDashboardAction } from "@/lib/actions";
import type { WidgetState } from "@/lib/dashboard";
import { useLockScroll } from "@/lib/client/lock-scroll";
import { cx } from "@/lib/format";

/** "Customise home": show or hide blocks and change their order. */
export function DashboardCustomizer({ widgets }: { widgets: WidgetState[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useLockScroll(open);
  const [items, setItems] = useState(widgets);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();

  const move = (i: number, dir: -1 | 1) =>
    setItems((list) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const toggle = (i: number) => setItems((list) => list.map((w, k) => (k === i ? { ...w, visible: !w.visible } : w)));

  if (!open) {
    return (
      <button
        onClick={() => {
          setItems(widgets);
          setError(false);
          setOpen(true);
        }}
        className="btn btn-ghost w-full"
      >
        <SlidersHorizontal size={17} /> Налаштувати головну
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 md:items-center" onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Налаштувати головну"
        className="pb-safe flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-[28px] bg-surface md:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 pb-2">
          <h2 className="text-xl font-bold">Налаштувати головну</h2>
          <p className="text-sm text-muted">Око — показати чи сховати блок, стрілки — змінити порядок.</p>
        </div>
        <ul className="flex-1 overflow-y-auto px-2">
          {items.map((w, i) => (
            <li key={w.id} className="flex items-center gap-1 rounded-2xl px-2 py-1.5">
              <button
                onClick={() => toggle(i)}
                role="switch"
                aria-checked={w.visible}
                aria-label={`${w.label}: ${w.visible ? "показується" : "сховано"}`}
                className={cx("icon-btn", w.visible ? "bg-accent/20 text-accent" : "bg-surface-2 text-muted")}
              >
                {w.visible ? <Eye size={19} /> : <EyeOff size={19} />}
              </button>
              <span className={cx("min-w-0 flex-1 truncate px-2 text-[15px] font-medium", !w.visible && "text-muted")}>{w.label}</span>
              <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Вище: ${w.label}`} className="icon-btn bg-surface-2 text-ink">
                <ArrowUp size={18} />
              </button>
              <button onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Нижче: ${w.label}`} className="icon-btn bg-surface-2 text-ink">
                <ArrowDown size={18} />
              </button>
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="px-4 text-sm text-critical">
            Не вдалося зберегти — перевірте звʼязок.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 p-4">
          <button onClick={() => setOpen(false)} className="btn btn-ghost">
            Скасувати
          </button>
          <button
            disabled={pending}
            onClick={() =>
              start(async () => {
                try {
                  await saveDashboardAction({ order: items.map((w) => w.id), hidden: items.filter((w) => !w.visible).map((w) => w.id) });
                  setOpen(false);
                  router.refresh();
                } catch {
                  setError(true);
                }
              })
            }
            className="btn btn-primary"
          >
            {pending ? "Збереження…" : "Зберегти"}
          </button>
        </div>
      </div>
    </div>
  );
}
