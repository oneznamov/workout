"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { rescheduleWorkoutAction } from "@/lib/actions";

/** For a planned workout whose day has passed: move it to today or tomorrow in one tap. */
export function RescheduleButtons({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const move = (inDays: number) =>
    start(async () => {
      await rescheduleWorkoutAction(id, inDays);
      router.refresh();
    });
  return (
    <div className="mt-1.5 flex items-center gap-2 px-1 text-xs text-muted">
      Перенести:
      <button disabled={pending} onClick={() => move(0)} className="rounded-full bg-surface-2 px-3 py-1.5 font-medium text-ink hover:bg-surface-3 disabled:opacity-40">
        на сьогодні
      </button>
      <button disabled={pending} onClick={() => move(1)} className="rounded-full bg-surface-2 px-3 py-1.5 font-medium text-ink hover:bg-surface-3 disabled:opacity-40">
        на завтра
      </button>
    </div>
  );
}
