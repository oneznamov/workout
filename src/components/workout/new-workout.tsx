"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CalendarPlus, LayoutTemplate, Play } from "lucide-react";
import type { WorkoutStatus } from "@/db/schema";
import { hardNavigate, newWorkout, pushWorkout, writeLocal } from "@/lib/client/offline";

/** Creates the workout on the device first, so it works with or without a connection. */
export function NewWorkoutButtons({ compact, localOnly }: { compact?: boolean; localOnly?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const create = (status: WorkoutStatus) =>
    start(async () => {
      const w = newWorkout(status);
      writeLocal(w.id, { workout: w, dirty: true, deletedExerciseIds: [], deletedSetIds: [], rev: 1 });
      const r = await pushWorkout(w.id);
      if (r.status === "ok" && !localOnly) router.push(`/workouts/${w.id}`);
      else hardNavigate(`/train#${w.id}`);
    });
  return (
    <div className="flex flex-wrap gap-2">
      <button disabled={pending} onClick={() => create("in_progress")} className="btn btn-primary">
        <Play size={18} /> Почати зараз
      </button>
      <button disabled={pending} onClick={() => create("planned")} className="btn btn-ghost">
        <CalendarPlus size={17} /> Запланувати
      </button>
      {!compact && (
        <button disabled={pending} onClick={() => create("template")} className="btn btn-ghost">
          <LayoutTemplate size={17} /> Шаблон
        </button>
      )}
    </div>
  );
}
