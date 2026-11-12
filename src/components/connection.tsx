"use client";

import { useEffect } from "react";
import { Check, CloudOff, Loader2, UploadCloud } from "lucide-react";
import { startOffline, syncAll, useConnection } from "@/lib/client/offline";
import { cx } from "@/lib/format";

/** Starts connectivity tracking, background sync and the "pre-save" download. Renders nothing. */
export function OfflineBoot() {
  useEffect(() => {
    startOffline();
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  return null;
}

/** Always-visible link status: online / syncing / changes waiting / offline. */
export function ConnectionBadge({ compact }: { compact?: boolean }) {
  const { online, syncing, pending } = useConnection();
  const view = !online
    ? {
        icon: <CloudOff size={14} />,
        label: pending ? `Офлайн · ${pending} на пристрої` : "Офлайн",
        cls: "bg-critical/15 text-critical",
        hint: "Немає звʼязку із сервером. Зміни зберігаються на цьому пристрої й надішлються, коли звʼязок зʼявиться.",
      }
    : syncing
      ? { icon: <Loader2 size={14} className="animate-spin" />, label: "Синхронізація", cls: "bg-surface-2 text-ink-2", hint: "Надсилаю зміни на сервер" }
      : pending
        ? {
            icon: <UploadCloud size={14} />,
            label: `Не надіслано: ${pending}`,
            cls: "bg-warning/15 text-warning",
            hint: "Є зміни, які ще не на сервері. Натисніть, щоб надіслати.",
          }
        : { icon: <Check size={14} strokeWidth={3} />, label: "Онлайн", cls: "bg-good/15 text-good", hint: "Звʼязок із сервером є, усе збережено" };
  return (
    <button
      onClick={() => void syncAll()}
      title={view.hint}
      aria-live="polite"
      aria-label={`Стан звʼязку: ${view.label}`}
      className={cx("inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold", view.cls)}
    >
      {view.icon}
      {(!compact || !online || pending > 0) && <span>{view.label}</span>}
      {compact && online && !pending && <span>Онлайн</span>}
    </button>
  );
}
