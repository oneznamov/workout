"use client";

import { useTransition } from "react";
import { CalendarPlus, LayoutTemplate, Play } from "lucide-react";
import { createWorkoutAction } from "@/lib/actions";

export function NewWorkoutButtons({ compact }: { compact?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <button disabled={pending} onClick={() => start(() => createWorkoutAction({ status: "in_progress" }))} className="btn btn-primary">
        <Play size={16} /> Почати зараз
      </button>
      <button disabled={pending} onClick={() => start(() => createWorkoutAction({ status: "planned" }))} className="btn btn-ghost">
        <CalendarPlus size={16} /> Запланувати
      </button>
      {!compact && (
        <button disabled={pending} onClick={() => start(() => createWorkoutAction({ status: "template" }))} className="btn btn-ghost">
          <LayoutTemplate size={16} /> Шаблон
        </button>
      )}
    </div>
  );
}
