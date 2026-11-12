import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/lib/format";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        <h1 className="truncate text-[2rem] leading-tight font-bold tracking-tight">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Section title in the "Summary" style: bold, with an optional link on the right. */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3">
      <h2 className="text-[1.35rem] font-bold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

export function Card({
  title,
  tone,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  /** Tailwind text color for the card title, e.g. "text-heart" */
  tone?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("card p-4", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className={cx("text-[15px] font-semibold", tone ?? "text-ink")}>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  unit,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  /** Tailwind text color for the value, e.g. "text-strength" */
  tone?: string;
}) {
  return (
    <div className="card p-4">
      <div className="caps">{label}</div>
      <div className={cx("num mt-1 text-[1.75rem] leading-none font-semibold", tone)}>
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-muted">{unit}</span>}
      </div>
      {hint && <div className="mt-1.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "good" | "warning" }) {
  const tones = {
    neutral: "bg-surface-2 text-ink-2",
    accent: "bg-accent/20 text-accent",
    good: "bg-good/20 text-good",
    warning: "bg-warning/20 text-warning",
  };
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="card p-8 text-center text-sm text-muted">{children}</div>;
}

export function Segmented({ options, current, param }: { options: { value: string; label: string }[]; current: string; param: string }) {
  return (
    <div className="inline-flex rounded-full bg-surface p-1" role="group" aria-label="Період">
      {options.map((o) => (
        <Link
          key={o.value}
          href={`?${param}=${o.value}`}
          aria-current={o.value === current ? "true" : undefined}
          className={cx(
            "rounded-full px-3.5 py-1.5 text-[13px] font-medium",
            o.value === current ? "bg-surface-3 text-ink" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-label="Завантаження" aria-busy="true">
      <div className="h-9 w-48 rounded-xl bg-surface" />
      <div className="h-32 rounded-[20px] bg-surface" />
      <div className="h-64 rounded-[20px] bg-surface" />
    </div>
  );
}
