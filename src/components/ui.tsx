import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/lib/format";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("card p-4", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-medium text-ink-2">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, unit, hint }: { label: string; value: ReactNode; unit?: string; hint?: ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-muted">{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "good" | "warning" }) {
  const tones = {
    neutral: "bg-white/10 text-ink-2",
    accent: "bg-accent/20 text-ink",
    good: "bg-good/20 text-ink",
    warning: "bg-warning/20 text-ink",
  };
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs", tones[tone])}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">{children}</div>;
}

export function Segmented({ options, current, param }: { options: { value: string; label: string }[]; current: string; param: string }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface p-0.5" role="group" aria-label="Період">
      {options.map((o) => (
        <Link
          key={o.value}
          href={`?${param}=${o.value}`}
          aria-current={o.value === current ? "true" : undefined}
          className={cx("rounded-md px-3 py-1 text-xs", o.value === current ? "bg-white/10 text-ink" : "text-muted hover:text-ink")}
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
      <div className="h-8 w-48 rounded-lg bg-surface" />
      <div className="h-32 rounded-2xl bg-surface" />
      <div className="h-64 rounded-2xl bg-surface" />
    </div>
  );
}
