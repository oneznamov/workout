"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, Bike, Dumbbell, HeartPulse, Home, Settings } from "lucide-react";
import { cx } from "@/lib/format";
import { ConnectionBadge } from "./connection";

const items = [
  { href: "/", label: "Головна", icon: Home },
  { href: "/workouts", label: "Тренування", icon: Activity, also: ["/train", "/exercises"], mobileAlso: true },
  { href: "/cardio", label: "Кардіо", icon: Bike },
  { href: "/exercises", label: "Вправи", icon: Dumbbell, desktopOnly: true },
  { href: "/analytics", label: "Аналітика", icon: BarChart3 },
  { href: "/health", label: "Здоров'я", icon: HeartPulse },
  { href: "/settings", label: "Налаштування", icon: Settings, desktopOnly: true },
];

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

export function Nav() {
  const pathname = usePathname();
  const active = (i: (typeof items)[number], mobile = false) => {
    if (i.href === "/") return pathname === "/";
    if (pathname.startsWith(i.href)) return true;
    // On the phone "Вправи" has no tab of its own — it lives under "Тренування".
    return (i.also ?? []).some((p) => pathname.startsWith(p) && (mobile || p !== "/exercises"));
  };
  return (
    <>
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
            </Link>
          ))}
        </nav>
        <div className="mt-auto px-2">
          <ConnectionBadge />
        </div>
      </aside>

      {/* Mobile top bar */}
      {/* Solid, not translucent: in the installed app it also covers the status-bar area. */}
      <header className="pt-safe fixed inset-x-0 top-0 z-30 bg-plane md:hidden">
        <div className="flex h-12 items-center justify-between px-4">
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
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-plane/85 backdrop-blur-xl md:hidden">
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
                <i.icon size={23} />
                {i.label}
              </Link>
            ))}
        </div>
      </nav>
    </>
  );
}
