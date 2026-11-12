"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { MUSCLE_GROUPS, type MuscleGroup } from "@/db/schema";
import { cx } from "@/lib/format";
import { EQUIPMENT_LABEL, MUSCLE_LABEL } from "@/lib/labels";
import type { CExerciseInfo } from "@/lib/shape";

export function ExerciseBrowser({ exercises }: { exercises: (CExerciseInfo & { custom: boolean })[] }) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return exercises.filter(
      (e) =>
        (!muscle || e.muscle === muscle) &&
        (!needle || e.name.toLowerCase().includes(needle) || (e.nameUk ?? "").toLowerCase().includes(needle)),
    );
  }, [q, muscle, exercises]);
  const groups = MUSCLE_GROUPS.map((m) => ({ m, items: filtered.filter((e) => e.muscle === m) })).filter((g) => g.items.length);

  return (
    <div className="space-y-4">
      <label className="relative block">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пошук вправи…" aria-label="Пошук вправи" className="field pl-9" />
      </label>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
        {[null, ...MUSCLE_GROUPS].map((m) => (
          <button
            key={m ?? "all"}
            onClick={() => setMuscle(m)}
            className={cx(
              "shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap",
              muscle === m ? "bg-accent text-accent-ink" : "bg-surface text-ink-2 hover:bg-surface-2",
            )}
          >
            {m ? MUSCLE_LABEL[m] : "Усі"}
          </button>
        ))}
      </div>
      {groups.map((g) => (
        <section key={g.m}>
          <h2 className="mb-2 text-[1.2rem] font-bold tracking-tight">
            {MUSCLE_LABEL[g.m]} <span className="text-sm font-medium text-muted">{g.items.length}</span>
          </h2>
          <ul className="card grid divide-y divide-line overflow-hidden sm:grid-cols-2 sm:divide-y-0">
            {g.items.map((e) => (
              <li key={e.id}>
                <Link href={`/exercises/${e.id}`} className="block px-4 py-3 hover:bg-surface-2">
                  <span className="block truncate text-[15px] font-medium">
                    {e.name}
                    {e.custom && <span className="ml-2 text-xs text-accent">своя</span>}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {e.nameUk ? `${e.nameUk} · ` : ""}
                    {EQUIPMENT_LABEL[e.equipment]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {groups.length === 0 && <p className="py-8 text-center text-sm text-muted">Нічого не знайдено</p>}
    </div>
  );
}
