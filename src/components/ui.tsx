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
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>}
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
  icon,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  icon?: ReactNode;
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
          {title && <h2 className={cx("flex items-center gap-1.5 text-[15px] font-semibold", tone ?? "text-ink")}>{icon}{title}</h2>}
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
  icon,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  /** Tailwind text color of the category (icon + label), e.g. "text-strength" */
  tone?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="card p-4">
      <div className={cx("flex items-center gap-1.5 text-[13px] leading-tight font-semibold", tone ?? "text-ink-2")}>
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="num mt-2 text-[1.75rem] leading-none font-semibold text-ink">
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
  return <div className="card col-span-full p-8 text-center text-sm text-muted">{children}</div>;
}

export function Segmented({
  options,
  current,
  param,
  extra,
  label = "Період",
}: {
  options: { value: string; label: string }[];
  current: string;
  param: string;
  /** Other query parameters to keep when switching. */
  extra?: Record<string, string>;
  label?: string;
}) {
  return (
    <div className="flex w-full rounded-full bg-surface p-1 sm:inline-flex sm:w-auto" role="group" aria-label={label}>
      {options.map((o) => (
        <Link
          key={o.value}
          href={`?${new URLSearchParams({ ...extra, [param]: o.value })}`}
          aria-current={o.value === current ? "true" : undefined}
          className={cx(
            "flex-1 rounded-full px-3.5 py-1.5 text-center text-[13px] font-medium whitespace-nowrap sm:flex-none",
            o.value === current ? "bg-surface-3 text-ink" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

/**
 * What a page shows while its data loads. The heading is the real one and stands exactly where
 * it will stay, so switching pages does not make the screen jump; the grey blocks below appear
 * only if loading takes noticeably long.
 */
export function PageSkeleton({ title, subtitle, variant }: { title?: string; subtitle?: ReactNode; variant?: "home" }) {
  const blocks = (
    <div className="skeleton-body space-y-4">
      <div className="h-32 animate-pulse rounded-[20px] bg-surface" />
      <div className="h-64 animate-pulse rounded-[20px] bg-surface" />
    </div>
  );
  const line = <span className="invisible">–</span>;
  if (variant === "home") {
    return (
      <div className="space-y-6" aria-label="Завантаження" aria-busy="true">
        <header>
          <p className="caps">{line}</p>
          <h1 className="truncate text-[2rem] leading-tight font-bold tracking-tight">Привіт</h1>
        </header>
        {blocks}
      </div>
    );
  }
  return (
    <div aria-label="Завантаження" aria-busy="true">
      {title ? (
        <PageHeader title={title} subtitle={subtitle ?? line} />
      ) : (
        <header className="mb-5">
          <p className="text-sm">{line}</p>
          <div className="skeleton-body h-10 w-48 animate-pulse rounded-xl bg-surface" />
        </header>
      )}
      {blocks}
    </div>
  );
}

/** A card that stays folded until tapped — for instructions and rarely needed settings. */
export function Disclosure({ title, hint, children, defaultOpen }: { title: string; hint?: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="card group" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold">{title}</span>
          {hint && <span className="block truncate text-xs text-muted">{hint}</span>}
        </span>
        <span className="shrink-0 text-muted transition-transform group-open:rotate-90" aria-hidden="true">
          ›
        </span>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}
