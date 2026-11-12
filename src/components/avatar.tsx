import { cx } from "@/lib/format";

/** A person as a circle: their photo when there is one, else the first letter of their name. */
export function Avatar({ name, photo, size = 36, tone = "bg-surface-2", className }: { name: string; photo?: string | null; size?: number; tone?: string; className?: string }) {
  if (photo) {
    // A plain <img>: the photo is a small private file served by the app itself.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" width={size} height={size} className={cx("shrink-0 rounded-full object-cover", className)} style={{ width: size, height: size }} />;
  }
  return (
    <span className={cx("grid shrink-0 place-items-center rounded-full font-bold uppercase", tone, className)} style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }} aria-hidden="true">
      {name.trim().slice(0, 1) || "?"}
    </span>
  );
}
