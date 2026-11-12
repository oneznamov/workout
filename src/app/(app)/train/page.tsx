"use client";

import { useMemo, useSyncExternalStore } from "react";
import { ChevronRight, Smartphone } from "lucide-react";
import { ConnectionBadge } from "@/components/connection";
import { WorkoutEditor } from "@/components/workout/editor";
import { NewWorkoutButtons } from "@/components/workout/new-workout";
import { readBundle, useLocalWorkouts, type LocalWorkout } from "@/lib/client/offline";
import { EXERCISES_FORMS, fmtDateLong, plural } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/labels";

const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

/**
 * Works with no connection at all: lists the workouts stored on this device and runs
 * the workout screen straight from device storage. The service worker sends every
 * page here when the server cannot be reached.
 */
export default function TrainPage() {
  const id = useSyncExternalStore(subscribeHash, () => window.location.hash.slice(1), () => "");
  const local = useLocalWorkouts();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const bundle = useMemo(() => (mounted ? readBundle() : null), [mounted]);
  if (!mounted) return null;

  if (id) {
    const rec = local.find((l) => l.workout.id === id);
    if (!rec) {
      return (
        <div className="card space-y-3 p-6 text-center">
          <p className="text-[15px]">Цього тренування немає на пристрої.</p>
          <p className="text-sm text-muted">Воно зʼявиться тут після того, як ви відкриєте застосунок зі звʼязком.</p>
          <a href="/train" className="btn btn-ghost">
            До списку
          </a>
        </div>
      );
    }
    return <WorkoutEditor key={id} initial={rec.workout} last={bundle?.last ?? {}} exercises={bundle?.exercises ?? []} localOnly />;
  }

  const by = (status: string) => local.filter((l) => l.workout.status === status);
  const unsent = local.filter((l) => l.dirty && l.workout.status === "completed");
  return (
    <div className="space-y-6">
      <header>
        <p className="flex items-center gap-2 text-sm text-muted">
          <Smartphone size={15} /> Збережено на цьому пристрої
        </p>
        <h1 className="text-[2rem] leading-tight font-bold tracking-tight">Тренування офлайн</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ConnectionBadge />
          <span className="text-sm text-muted">Усе, що ви тут зробите, надішлеться на сервер, щойно зʼявиться звʼязок.</span>
        </div>
      </header>

      <NewWorkoutButtons localOnly />

      <Group title="Триває" items={by("in_progress")} />
      <Group title="Заплановані" items={by("planned").sort((a, b) => (a.workout.scheduledFor ?? "9").localeCompare(b.workout.scheduledFor ?? "9"))} />
      <Group title="Шаблони" items={by("template")} />
      <Group title="Чекають надсилання" items={unsent} />

      {local.length === 0 && (
        <div className="card p-8 text-center text-sm text-muted">
          На пристрої ще немає тренувань. Заплановані тренування й шаблони завантажуються сюди автоматично, коли є звʼязок.
        </div>
      )}
    </div>
  );
}

function Group({ title, items }: { title: string; items: LocalWorkout[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2.5 text-[1.35rem] font-bold tracking-tight">{title}</h2>
      <div className="card divide-y divide-line overflow-hidden">
        {items.map(({ workout: w, dirty }) => (
          <a key={w.id} href={`#${w.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{w.name}</span>
              <span className="block truncate text-xs text-muted">
                {STATUS_LABEL[w.status]}
                {w.status === "planned" && w.scheduledFor ? ` · ${fmtDateLong(w.scheduledFor)}` : ""} · {plural(w.exercises.length, EXERCISES_FORMS)}
              </span>
            </span>
            {dirty && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">не надіслано</span>}
            <ChevronRight size={18} className="shrink-0 text-muted" />
          </a>
        ))}
      </div>
    </section>
  );
}
