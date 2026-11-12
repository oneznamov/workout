"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, Dumbbell, HeartPulse, Home, Settings } from "lucide-react";
import { cx } from "@/lib/format";

const items = [
  { href: "/", label: "Головна", icon: Home },
  { href: "/workouts", label: "Тренування", icon: Activity },
  { href: "/exercises", label: "Вправи", icon: Dumbbell },
  { href: "/analytics", label: "Аналітика", icon: BarChart3 },
  { href: "/health", label: "Здоров'я", icon: HeartPulse },
  { href: "/settings", label: "Налаштування", icon: Settings, desktopOnly: true },
];

export function Nav() {
  const pathname = usePathname();
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-line bg-surface p-4 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2 text-lg font-semibold">
          <span className="grid size-7 place-items-center rounded-lg bg-accent text-white">
            <Dumbbell size={16} />
          </span>
          Workout
        </Link>
        <nav className="flex flex-col gap-1">
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? "page" : undefined}
              className={cx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active(href) ? "bg-white/10 text-ink" : "text-ink-2 hover:bg-white/5",
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Mobile tab bar */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {items
            .filter((i) => !i.desktopOnly)
            .map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={active(href) ? "page" : undefined}
                className={cx(
                  "flex flex-col items-center gap-0.5 py-2 text-[10px]",
                  active(href) ? "text-accent" : "text-muted",
                )}
              >
                <Icon size={22} />
                {label}
              </Link>
            ))}
        </div>
      </nav>
    </>
  );
}
