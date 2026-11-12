"use client";

import type { ReactNode } from "react";
import type { MuscleGroup } from "@/db/schema";
import { fmtNum } from "@/lib/format";
import { MUSCLE_LABEL } from "@/lib/labels";
import { muscleStatus, STATUS_INFO } from "@/lib/muscles";

const SURFACE = "#1a1a19";
const BODY = "#272725";

type Values = Partial<Record<MuscleGroup, number>>;

/** Mirrors a left-side shape onto the right side of the 200-wide figure. */
function Both({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <g transform="translate(200 0) scale(-1 1)">{children}</g>
    </>
  );
}

function Silhouette() {
  return (
    <g fill={BODY}>
      <ellipse cx="100" cy="30" rx="17" ry="21" />
      <path d="M91 46h18l4 18H87z" />
      <path d="M66 64Q100 54 134 64L131 122Q128 160 127 186H73Q72 160 69 122Z" />
      <path d="M73 180h54l6 36H67z" />
      <Both>
        <path d="M66 64Q46 62 43 92L39 152H59L63 112Q68 86 66 64Z" />
        <path d="M39 150H59L53 212H39Z" />
        <ellipse cx="45" cy="223" rx="8" ry="12" />
        <path d="M67 210H100L96 302H72Z" />
        <path d="M72 298H96L91 392H75Z" />
        <ellipse cx="82" cy="400" rx="12" ry="7" />
      </Both>
    </g>
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
      fill={info.fill}
      stroke={isSelected ? "#f0efec" : SURFACE}
      strokeWidth={2}
      strokeLinejoin="round"
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? isSelected : undefined}
      aria-label={`${MUSCLE_LABEL[muscle]}: ${fmtNum(v, 1)} підходів, ${info.label.toLowerCase()}`}
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
      <title>{`${MUSCLE_LABEL[muscle]} · ${fmtNum(v, 1)} підх. · ${info.label}`}</title>
      {children}
    </g>
  );
}

/** Front and back body figures; each muscle group is tinted by its weekly set count. */
export function BodyMap({
  values,
  selected = null,
  onSelect,
  className,
}: {
  values: Values;
  selected?: MuscleGroup | null;
  onSelect?: (m: MuscleGroup) => void;
  className?: string;
}) {
  const r = { values, selected, onSelect };
  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-2">
        <figure>
          <svg viewBox="20 4 160 408" className="mx-auto h-auto w-full max-w-[13rem]" role="group" aria-label="Мʼязи, вигляд спереду">
            <Silhouette />
            <Region muscle="shoulders" {...r}>
              <Both>
                <path d="M67 65Q50 63 45 82Q44 92 47 98Q56 96 63 88Q69 76 67 65Z" />
              </Both>
            </Region>
            <Region muscle="chest" {...r}>
              <Both>
                <path d="M99 70Q82 67 70 74Q65 90 71 104Q86 113 99 105Z" />
              </Both>
            </Region>
            <Region muscle="biceps" {...r}>
              <Both>
                <path d="M46 100Q54 96 62 100Q63 126 59 148H42Q40 122 46 100Z" />
              </Both>
            </Region>
            <Region muscle="forearms" {...r}>
              <Both>
                <path d="M40 154H58Q58 184 52 208H41Q37 180 40 154Z" />
              </Both>
            </Region>
            <Region muscle="core" {...r}>
              <rect x="85" y="110" width="30" height="72" rx="8" />
              <Both>
                <path d="M72 110Q79 112 82 118V178Q76 176 74 166Q70 138 72 110Z" />
              </Both>
            </Region>
            <Region muscle="quads" {...r}>
              <Both>
                <path d="M69 218Q84 208 98 218L95 290Q84 300 74 290Z" />
              </Both>
            </Region>
            <Region muscle="calves" {...r}>
              <Both>
                <path d="M75 306Q84 300 93 306Q94 340 89 384H78Q73 340 75 306Z" />
              </Both>
            </Region>
          </svg>
          <figcaption className="mt-1 text-center text-xs text-muted">Спереду</figcaption>
        </figure>

        <figure>
          <svg viewBox="20 4 160 408" className="mx-auto h-auto w-full max-w-[13rem]" role="group" aria-label="Мʼязи, вигляд ззаду">
            <Silhouette />
            <Region muscle="back" {...r}>
              <path d="M100 56L74 70Q86 90 100 124Q114 90 126 70Z" />
              <Both>
                <path d="M70 96Q86 104 98 130V176Q82 172 76 152Q70 124 70 96Z" />
              </Both>
            </Region>
            <Region muscle="shoulders" {...r}>
              <Both>
                <path d="M67 65Q50 63 45 82Q44 92 47 98Q56 96 63 88Q69 76 67 65Z" />
              </Both>
            </Region>
            <Region muscle="triceps" {...r}>
              <Both>
                <path d="M46 100Q54 96 62 100Q63 126 59 148H42Q40 122 46 100Z" />
              </Both>
            </Region>
            <Region muscle="forearms" {...r}>
              <Both>
                <path d="M40 154H58Q58 184 52 208H41Q37 180 40 154Z" />
              </Both>
            </Region>
            <Region muscle="glutes" {...r}>
              <Both>
                <path d="M99 184Q80 180 70 192Q66 208 72 218Q88 224 99 216Z" />
              </Both>
            </Region>
            <Region muscle="hamstrings" {...r}>
              <Both>
                <path d="M71 226Q85 220 98 226L95 290Q84 298 75 290Z" />
              </Both>
            </Region>
            <Region muscle="calves" {...r}>
              <Both>
                <path d="M74 306Q84 298 94 306Q96 336 89 372H79Q72 336 74 306Z" />
              </Both>
            </Region>
          </svg>
          <figcaption className="mt-1 text-center text-xs text-muted">Ззаду</figcaption>
        </figure>
      </div>
    </div>
  );
}
