"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarPlus, LayoutTemplate, Pencil, Play, Plus, Route, Sparkles } from "lucide-react";
import type { WorkoutStatus } from "@/db/schema";
import { PlanWithAi } from "@/components/ai";
import { NewProgramButton } from "@/components/programs";
import { hardNavigate, newWorkout, pushWorkout, writeLocal } from "@/lib/client/offline";
import { ActionSheet } from "./parts";
import { PlanSheet } from "./plan-sheet";

/**
 * The three ways to get a workout: start one now, plan one from what already exists (templates,
 * programmes), or create something new — by hand or with AI. New workouts are made on the
 * device first, so starting works with or without a connection.
 */
export function NewWorkoutButtons({ compact, localOnly, ai }: { compact?: boolean; localOnly?: boolean; ai?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sheet, setSheet] = useState<"plan" | "create" | "ai" | "program" | null>(null);
  const create = (status: WorkoutStatus) =>
    start(async () => {
      const w = newWorkout(status);
      writeLocal(w.id, { workout: w, dirty: true, deletedExerciseIds: [], deletedSetIds: [], rev: 1 });
      const r = await pushWorkout(w.id);
      if (r.status === "ok" && !localOnly) router.push(`/workouts/${w.id}`);
      else hardNavigate(`/train#${w.id}`);
    });
  return (
    <div className="grid w-full max-w-md grid-cols-2 gap-2 sm:flex sm:w-auto sm:max-w-none">
      <button disabled={pending} onClick={() => create("in_progress")} className={compact ? "btn btn-primary px-3" : "btn btn-primary col-span-2"}>
        <Play size={18} /> Почати зараз
      </button>
      {/* Without a connection there is nothing to pick from — plan an empty one. */}
      <button disabled={pending} onClick={() => (localOnly ? create("planned") : setSheet("plan"))} className="btn btn-ghost px-3">
        <CalendarPlus size={17} /> Запланувати
      </button>
      {!compact &&
        (localOnly ? (
          <button disabled={pending} onClick={() => create("template")} className="btn btn-ghost px-3">
            <LayoutTemplate size={17} /> Шаблон
          </button>
        ) : (
          <button disabled={pending} onClick={() => setSheet("create")} className="btn btn-ghost px-3">
            <Plus size={18} /> Створити
          </button>
        ))}
      {sheet === "plan" && <PlanSheet onClose={() => setSheet(null)} />}
      {sheet === "create" && (
        <ActionSheet
          title="Створити"
          onClose={() => setSheet(null)}
          actions={[
            { label: "Тренування — скласти самому", icon: <Pencil size={19} />, onSelect: () => create("planned") },
            ...(ai ? [{ label: "Тренування або програму — з ШІ", icon: <Sparkles size={19} className="text-body" />, onSelect: () => setSheet("ai") }] : []),
            { label: "Шаблон для повторення", icon: <LayoutTemplate size={19} />, onSelect: () => create("template") },
            { label: "Програму на кілька тижнів", icon: <Route size={19} />, onSelect: () => setSheet("program") },
          ]}
        />
      )}
      {sheet === "ai" && <PlanWithAi startOpen onClosed={() => setSheet(null)} />}
      {sheet === "program" && <NewProgramButton startOpen ai={ai} onClosed={() => setSheet(null)} />}
    </div>
  );
}
