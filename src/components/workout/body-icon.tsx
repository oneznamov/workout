import { HeartPulse } from "lucide-react";
import { cx } from "@/lib/format";
import type { WorkoutKind } from "@/lib/workout-kind";

/**
 * Tiny body figure with the trained zones lit — shows at a glance whether a workout is
 * legs, upper body, full body and so on. A mostly-cardio session gets a heart instead.
 */
export function BodyIcon({ kind, size = 44, className }: { kind: WorkoutKind; size?: number; className?: string }) {
  const off = "var(--surface-3)";
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
        <svg viewBox="0 0 32 40" height={size * 0.72} aria-hidden="true">
          <circle cx="16" cy="4.4" r="3.7" fill={off} />
          <circle cx="8.3" cy="12.2" r="2.7" fill={on(z.shoulders)} />
          <circle cx="23.7" cy="12.2" r="2.7" fill={on(z.shoulders)} />
          <rect x="6.3" y="15.6" width="3.9" height="11" rx="1.95" fill={on(z.arms)} />
          <rect x="21.8" y="15.6" width="3.9" height="11" rx="1.95" fill={on(z.arms)} />
          <rect x="11" y="9.6" width="10" height="10.6" rx="2.4" fill={on(z.torso)} />
          <rect x="11.4" y="21.2" width="9.2" height="5.4" rx="1.8" fill={on(z.core)} />
          <rect x="10.9" y="27.6" width="4.7" height="12" rx="2.2" fill={on(z.legs)} />
          <rect x="16.4" y="27.6" width="4.7" height="12" rx="2.2" fill={on(z.legs)} />
        </svg>
      )}
    </span>
  );
}
