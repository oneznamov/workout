"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useWakeLock } from "@/lib/client/wake-lock";
import { cx } from "@/lib/format";

/** What the AI is busy with, in the order it roughly happens. The last line stays until the answer arrives. */
export const AI_STEPS = {
  plan: ["Читаю ваші цілі й останні тренування", "Дивлюсь на сон і відновлення", "Розподіляю навантаження по мʼязах", "Підбираю вправи, вагу й підходи", "Перевіряю план і записую його"],
  revise: ["Дивлюсь, що змінилось", "Звіряю з останніми тренуваннями і сном", "Перебудовую вправи й підходи", "Записую оновлене тренування"],
  analyse: ["Читаю тренування", "Порівнюю з попередніми", "Формулюю висновки"],
} as const;

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

/**
 * The wait for a long AI answer, made bearable: a calm moving mark, what is being done right
 * now, how long it has taken and how long it usually takes. The bar is honest about being an
 * estimate — it slows down as it fills and never claims to be finished. While this is on
 * screen the phone does not lock, so the request is not dropped.
 * `compact` is the one-line version for use inside a card.
 */
export function AiWorking({ title, steps, expect = 60, compact }: { title: string; steps: readonly string[]; /** how long it usually takes, seconds */ expect?: number; compact?: boolean }) {
  const [sec, setSec] = useState(0);
  useWakeLock(true);
  useEffect(() => {
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const step = steps[Math.min(steps.length - 1, Math.floor((sec / expect) * steps.length))];
  // Fills quickly at first, ever slower later: about two thirds at the usual time, never the whole bar.
  const filled = Math.min(96, Math.round((1 - Math.exp(-sec / (expect * 0.9))) * 100));
  const usual = expect >= 90 ? `до ${Math.ceil(expect / 60) + 1} хв` : "до хвилини-двох";
  const orb = (size: string, icon: number) => (
    <span className={cx("ai-orb relative grid shrink-0 place-items-center rounded-full", size)} aria-hidden="true">
      <span className="ai-orb-ring absolute inset-0 rounded-full" />
      <span className="ai-orb-core absolute inset-[3px] grid place-items-center rounded-full bg-surface">
        <Sparkles size={icon} className="ai-orb-spark text-body" />
      </span>
    </span>
  );
  if (compact) {
    return (
      <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
        {orb("size-9", 16)}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-semibold">{title}</span>
            <span className="num shrink-0 text-xs text-muted">{clock(sec)}</span>
          </div>
          <p key={step} className="ai-step truncate text-xs text-ink-2">
            {step}…
          </p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-body transition-[width] duration-1000 ease-linear" style={{ width: `${filled}%` }} />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 px-2 py-6 text-center">
      {orb("size-20", 30)}
      <div className="space-y-1">
        <p className="text-lg font-bold">{title}</p>
        <p key={step} className="ai-step min-h-10 text-sm text-ink-2">
          {step}…
        </p>
      </div>
      <div className="w-full max-w-xs space-y-1.5">
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-body transition-[width] duration-1000 ease-linear" style={{ width: `${filled}%` }} />
        </div>
        <div className="num flex justify-between text-xs text-muted">
          <span>{clock(sec)}</span>
          <span>зазвичай {usual}</span>
        </div>
      </div>
      <p className="max-w-xs text-xs text-muted">Екран не згасне, поки ШІ працює. Не закривайте застосунок — результат зʼявиться тут.</p>
    </div>
  );
}
