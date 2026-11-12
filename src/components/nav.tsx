"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Activity, BarChart3, CircleUser, Dumbbell, Home, Settings, Users } from "lucide-react";
import { cx } from "@/lib/format";
import { ConnectionBadge } from "./connection";

const items = [
  { href: "/", label: "Головна", icon: Home },
  { href: "/workouts", label: "Тренування", icon: Activity, also: ["/train", "/exercises", "/cardio"], mobileAlso: true },
  { href: "/exercises", label: "Вправи", icon: Dumbbell, desktopOnly: true },
  { href: "/analytics", label: "Аналітика", icon: BarChart3 },
  { href: "/team", label: "Команда", icon: Users },
  { href: "/profile", label: "Профіль", icon: CircleUser },
  { href: "/settings", label: "Налаштування", icon: Settings, desktopOnly: true },
];

/**
 * Each section has its colour, and the top of the screen glows with it and fades into black —
 * the way the Health app's Summary does. The phone's top bar paints the same slice of the same
 * gradient, so the glow runs behind it without a seam.
 */
const TINTS: [string, string][] = [
  ["/profile", "var(--c-body)"],
  ["/analytics", "var(--c-sleep)"],
  ["/team", "var(--c-cycle)"],
  ["/settings", "var(--muted)"],
  ["/admin", "var(--muted)"],
];
const GLOW_HEIGHT = "26rem";
const glow = (pathname: string) => {
  const tint = TINTS.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? "var(--accent)";
  return `linear-gradient(to bottom, color-mix(in srgb, ${tint} 20%, transparent), transparent)`;
};

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 text-[17px] font-bold tracking-tight">
      <span className="grid size-7 place-items-center rounded-full bg-accent text-accent-ink">
        <Dumbbell size={15} strokeWidth={2.5} />
      </span>
      Workout
    </Link>
  );
}

/** `teamBadge` is a small mark shown next to "Команда" while an invitation is waiting for an answer. */
export function Nav({ teamBadge }: { teamBadge?: ReactNode }) {
  const pathname = usePathname();
  // At the top of a page the phone's bar carries the section glow; once content scrolls under it, it turns plain.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const check = () => setScrolled(window.scrollY > 12);
    const first = requestAnimationFrame(check);
    window.addEventListener("scroll", check, { passive: true });
    return () => {
      cancelAnimationFrame(first);
      window.removeEventListener("scroll", check);
    };
  }, [pathname]);
  const active = (i: (typeof items)[number], mobile = false) => {
    if (i.href === "/") return pathname === "/";
    if (pathname.startsWith(i.href)) return true;
    // On the phone "Вправи" has no tab of its own — it lives under "Тренування".
    return (i.also ?? []).some((p) => pathname.startsWith(p) && (mobile || p !== "/exercises"));
  };
  return (
    <>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 md:left-60" style={{ height: GLOW_HEIGHT, backgroundImage: glow(pathname) }} />

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-plane p-4 md:flex">
        <div className="mb-6 px-2 pt-1">
          <Brand />
        </div>
        <nav className="flex flex-col gap-1">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={active(i) ? "page" : undefined}
              className={cx(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors",
                active(i) ? "bg-surface text-accent" : "text-ink-2 hover:bg-surface",
              )}
            >
              <i.icon size={19} />
              {i.label}
              {i.href === "/team" && <span className="ml-auto">{teamBadge}</span>}
            </Link>
          ))}
        </nav>
        <div className="mt-auto px-2">
          <ConnectionBadge />
        </div>
      </aside>

      {/* Mobile top bar */}
      {/* Solid, not translucent: in the installed app it also covers the status-bar area. */}
      <header
        data-chrome
        className={cx(
          "fixed inset-x-0 top-0 z-30 bg-plane pt-[calc(env(safe-area-inset-top)+1rem)] transition-shadow duration-300 md:hidden",
          scrolled && "shadow-[0_1px_0_var(--line)]",
        )}
      >
        <div
          aria-hidden="true"
          className={cx("pointer-events-none absolute inset-0 bg-no-repeat transition-opacity duration-300", scrolled && "opacity-0")}
          style={{ backgroundImage: glow(pathname), backgroundSize: `100% ${GLOW_HEIGHT}` }}
        />
        <div className="relative flex h-12 items-center justify-between px-4">
          <Brand />
          <div className="flex items-center gap-1">
            <ConnectionBadge compact />
            <Link href="/settings" aria-label="Налаштування" className="icon-btn size-9">
              <Settings size={19} />
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile tab bar */}
      <nav data-chrome className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-plane/85 backdrop-blur-xl md:hidden">
        <div className="grid grid-cols-5">
          {items
            .filter((i) => !i.desktopOnly)
            .map((i) => (
              <Link
                key={i.href}
                href={i.href}
                aria-current={active(i, true) ? "page" : undefined}
                className={cx(
                  "flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10px] font-medium",
                  active(i, true) ? "text-accent" : "text-muted",
                )}
              >
                <span className="relative">
                  <i.icon size={23} />
                  {i.href === "/team" && <span className="absolute -top-0.5 -right-1.5">{teamBadge}</span>}
                </span>
                {i.label}
              </Link>
            ))}
        </div>
      </nav>
    </>
  );
}
