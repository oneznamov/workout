"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Moon, Sparkles } from "lucide-react";
import { reviseWorkoutAction } from "@/lib/ai-actions";
import { fmtHours, type ReadinessLevel } from "@/lib/readiness";

/**
 * What last night means for today, said once on the home screen. A good night is one quiet
 * line; a short or bad one explains itself and — when a workout is planned for today — offers
 * to have the AI update it for that state in one tap (what to change is the AI's call).
 */
export function ReadinessNote({
  level,
  lastNight,
  reasons,
  advice,
  workout,
  ai,
  request,
}: {
  level: ReadinessLevel;
  lastNight: number;
  reasons: string[];
  advice: string;
  /** today's planned workout, if there is one */
  workout?: { id: string; name: string } | null;
  ai: boolean;
  /** what to ask the AI for */
  request: string;
}) {
  const router = useRouter();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (level === "rested") {
    return (
      <p className="flex items-center gap-2 px-1 text-sm text-good">
        <Moon size={15} className="shrink-0" /> Сон {fmtHours(lastNight)} — добре виспались, можна працювати на повну.
      </p>
    );
  }
  if (level !== "short" && level !== "poor") return null;
  return (
    <section className="space-y-2.5 rounded-[20px] bg-warning/10 p-4 ring-1 ring-warning/35">
      <div>
        <div className="flex items-center gap-2 text-[15px] font-semibold text-warning">
          <Moon size={17} className="shrink-0" /> Сон: {fmtHours(lastNight)}
        </div>
        <p className="mt-1 text-sm text-ink-2 first-letter:uppercase">
          {reasons.join("; ")}. {advice}
        </p>
      </div>
      {done ? (
        <p role="status" className="text-sm text-ink-2">
          <span className="font-semibold text-good">Тренування оновлено.</span> {done}{" "}
          <Link href={`/workouts/${workout!.id}`} className="font-semibold text-accent">
            Відкрити →
          </Link>
        </p>
      ) : workout ? (
        ai ? (
          <button
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await reviseWorkoutAction(workout.id, request);
                if (!r.ok) return setError(r.error);
                setDone(r.why);
                router.refresh();
              })
            }
            className="btn btn-primary btn-sm"
          >
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {pending ? "ШІ оновлює…" : `Оновити «${workout.name}»`}
          </button>
        ) : (
          <Link href={`/workouts/${workout.id}`} className="btn btn-ghost btn-sm">
            Відкрити сьогоднішнє тренування
          </Link>
        )
      ) : null}
      {error && (
        <p role="alert" className="text-sm text-critical">
          {error}
        </p>
      )}
    </section>
  );
}
