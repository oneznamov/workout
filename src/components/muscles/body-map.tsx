"use client";

import type { ReactNode } from "react";
import type { MuscleGroup } from "@/db/schema";
import { fmtNum } from "@/lib/format";
import { MUSCLE_LABEL } from "@/lib/labels";
import { loadColor, muscleStatus, STATUS_INFO } from "@/lib/muscles";
import type { Sex } from "@/lib/profile";
import { BODY_DATA } from "./body-data";

const SURFACE = "#1c1c1e";
const BODY = "#2c2c2e";

type Values = Partial<Record<MuscleGroup, number>>;

/** Which muscle group of the app each part of the figure belongs to; parts not listed are plain body (head, hands, feet…). */
const FRONT: Record<string, MuscleGroup> = {
  chest: "chest",
  abs: "core",
  obliques: "core",
  biceps: "biceps",
  triceps: "triceps",
  forearm: "forearms",
  deltoids: "shoulders",
  trapezius: "back",
  quadriceps: "quads",
  adductors: "quads",
  calves: "calves",
  tibialis: "calves",
};
const BACK: Record<string, MuscleGroup> = {
  trapezius: "back",
  "upper-back": "back",
  "lower-back": "back",
  deltoids: "shoulders",
  triceps: "triceps",
  forearm: "forearms",
  gluteal: "glutes",
  hamstring: "hamstrings",
  adductors: "hamstrings",
  calves: "calves",
};

function Region({
  muscle,
  values,
  selected,
  onSelect,
  children,
}: {
  muscle: MuscleGroup;
  values: Values;
  selected: MuscleGroup | null;
  onSelect?: (m: MuscleGroup) => void;
  children: ReactNode;
}) {
  const v = values[muscle] ?? 0;
  const info = STATUS_INFO[muscleStatus(v)];
  const isSelected = selected === muscle;
  const interactive = Boolean(onSelect);
  return (
    <g
      fill={loadColor(v)}
      stroke={isSelected ? "#ffffff" : SURFACE}
      strokeWidth={isSelected ? 7 : 2}
      strokeLinejoin="round"
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? isSelected : undefined}
      aria-label={`${MUSCLE_LABEL[muscle]}: ${fmtNum(v, 1)} балів навантаження, ${info.label.toLowerCase()}`}
      onClick={interactive ? () => onSelect!(muscle) : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect!(muscle);
              }
            }
          : undefined
      }
      className={interactive ? "cursor-pointer outline-none transition-opacity hover:opacity-80 focus-visible:opacity-80" : undefined}
    >
      <title>{`${MUSCLE_LABEL[muscle]} · ${fmtNum(v, 1)} балів · ${info.label}`}</title>
      {children}
    </g>
  );
}

const SIDES = [
  { key: "front", label: "Спереду", aria: "Мʼязи, вигляд спереду", muscles: FRONT },
  { key: "back", label: "Ззаду", aria: "Мʼязи, вигляд ззаду", muscles: BACK },
] as const;

/**
 * Front and back anatomical figures; each muscle group is tinted by its weekly load. The
 * figure follows the sex set in the profile (the male one when it is not set).
 */
export function BodyMap({
  values,
  selected = null,
  onSelect,
  sex = null,
  className,
}: {
  values: Values;
  selected?: MuscleGroup | null;
  onSelect?: (m: MuscleGroup) => void;
  sex?: Sex | null;
  className?: string;
}) {
  const r = { values, selected, onSelect };
  const figure = BODY_DATA[sex ?? "male"];
  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-2">
        {SIDES.map((side) => {
          const data = figure[side.key];
          // Paths of every part that belongs to the same muscle group are tinted together.
          const groups = new Map<MuscleGroup, string[]>();
          const plain: string[] = [];
          for (const part of data.parts) {
            const muscle = side.muscles[part.slug];
            if (!muscle) plain.push(...part.paths);
            else groups.set(muscle, [...(groups.get(muscle) ?? []), ...part.paths]);
          }
          return (
            <figure key={side.key}>
              <svg viewBox={data.viewBox} className="mx-auto h-auto w-full max-w-[13rem]" role="group" aria-label={side.aria}>
                <g fill={BODY}>
                  {plain.map((d, i) => (
                    <path key={i} d={d} />
                  ))}
                </g>
                {[...groups].map(([muscle, paths]) => (
                  <Region key={muscle} muscle={muscle} {...r}>
                    {paths.map((d, i) => (
                      <path key={i} d={d} />
                    ))}
                  </Region>
                ))}
              </svg>
              <figcaption className="mt-1 text-center text-xs text-muted">{side.label}</figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
