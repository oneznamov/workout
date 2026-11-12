import { cx } from "@/lib/format";

/** One dot per session of the day; from three on the dots turn hot, so a heavy day stands out. */
export function SessionDots({ count, dim }: { count: number; dim?: boolean }) {
  const n = Math.min(3, Math.max(0, count));
  return (
    <span className={cx("flex h-1.5 items-center justify-center gap-0.5", dim && "opacity-60")} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={cx("size-1.5 rounded-full", count >= 3 ? "bg-heart" : "bg-accent")} />
      ))}
    </span>
  );
}
