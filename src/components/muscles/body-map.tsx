"use client";

import type { ReactNode } from "react";
import type { MuscleGroup } from "@/db/schema";
import { fmtNum } from "@/lib/format";
import { MUSCLE_LABEL } from "@/lib/labels";
import { loadColor, muscleStatus, STATUS_INFO } from "@/lib/muscles";
import type { Sex } from "@/lib/profile";
import { bodyShapes, type Shape } from "./body-shapes";

const SURFACE = "#1c1c1e";
const BODY = "#2c2c2e";

type Values = Partial<Record<MuscleGroup, number>>;

/** Draws shapes described for the left half of the body; mirrored ones get their twin on the right. */
function Shapes({ shapes }: { shapes: Shape[] }) {
  return (
    <>
      {shapes.map((shape, i) => (
        <g key={i}>
          <path d={shape.d} />
          {shape.mirror && <path d={shape.d} transform="translate(200 0) scale(-1 1)" />}
        </g>
      ))}
    </>
  );
}

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
      strokeWidth={2}
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
  { key: "front", label: "Спереду", aria: "Мʼязи, вигляд спереду" },
  { key: "back", label: "Ззаду", aria: "Мʼязи, вигляд ззаду" },
] as const;

/**
 * Front and back body figures; each muscle group is tinted by its weekly load. The figure
 * follows the sex set in the profile (a male outline when it is not set).
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
  const body = bodyShapes(sex);
  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-2">
        {SIDES.map((side) => (
          <figure key={side.key}>
            <svg viewBox="20 2 160 412" className="mx-auto h-auto w-full max-w-[13rem]" role="group" aria-label={side.aria}>
              <g fill={BODY}>
                <ellipse {...body.head} />
                <Shapes shapes={body.outline} />
              </g>
              {(Object.entries(body[side.key]) as [MuscleGroup, Shape[]][]).map(([muscle, shapes]) => (
                <Region key={muscle} muscle={muscle} {...r}>
                  <Shapes shapes={shapes} />
                </Region>
              ))}
            </svg>
            <figcaption className="mt-1 text-center text-xs text-muted">{side.label}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
