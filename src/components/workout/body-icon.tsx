import { HeartPulse } from "lucide-react";
import { cx } from "@/lib/format";
import type { WorkoutKind } from "@/lib/workout-kind";

/** One arm: the shoulder cap and the arm below it. Drawn for the left side and mirrored for the right. */
function Arm({ shoulder, arm }: { shoulder: string; arm: string }) {
  return (
    <>
      <path d="M14.6 13.6C10.6 13.4 8.2 16 7.9 20.4L13.5 21.3Z" fill={shoulder} />
      <path d="M7.8 21.6L13.4 22.5L12.2 34.2C12 36.4 10.6 37.2 9.3 37.1C7.9 37 6.7 35.9 6.9 33.9Z" fill={arm} />
    </>
  );
}

/**
 * A small human silhouette with the trained part of the body lit — shows at a glance whether
 * a workout is legs, upper body, full body and so on. A mostly-cardio session gets a heart.
 */
export function BodyIcon({ kind, size = 44, className }: { kind: WorkoutKind; size?: number; className?: string }) {
  const off = "var(--axis)";
  const on = (lit: boolean) => (lit ? "currentColor" : off);
  const z = kind.zones;
  return (
    <span
      className={cx("grid shrink-0 place-items-center rounded-2xl bg-surface-2 text-strength", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={kind.label}
      title={kind.label}
    >
      {kind.cardio ? (
        <HeartPulse size={size * 0.5} className="text-heart" />
      ) : (
        <svg viewBox="0 0 48 58" height={size * 0.82} aria-hidden="true">
          <circle cx="24" cy="6.6" r="5.4" fill={off} />
          <path d="M17.6 13.2H30.4C32.4 13.2 33.6 14.4 33.4 16.4L32.2 26.4H15.8L14.6 16.4C14.4 14.4 15.6 13.2 17.6 13.2Z" fill={on(z.torso)} />
          <path d="M15.9 27.6H32.1L31.5 34.6C31.4 36 30.4 36.8 29 36.8H19C17.6 36.8 16.6 36 16.5 34.6Z" fill={on(z.core)} />
          <Arm shoulder={on(z.shoulders)} arm={on(z.arms)} />
          <g transform="translate(48 0) scale(-1 1)">
            <Arm shoulder={on(z.shoulders)} arm={on(z.arms)} />
          </g>
          <path d="M16.9 38H23.4L22.9 53.4C22.8 55.6 21.6 56.6 20 56.6C18.4 56.6 17.3 55.6 17.2 53.4Z" fill={on(z.legs)} />
          <path d="M24.6 38H31.1L30.8 53.4C30.7 55.6 29.6 56.6 28 56.6C26.4 56.6 25.2 55.6 25.1 53.4Z" fill={on(z.legs)} />
        </svg>
      )}
    </span>
  );
}
