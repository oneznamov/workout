"use client";

import { useEffect } from "react";
import { Check, CloudOff, Loader2, UploadCloud } from "lucide-react";
import { startOffline, syncAll, useConnection } from "@/lib/client/offline";
import { DEMO } from "@/lib/demo";
import { cx } from "@/lib/format";

/** Starts connectivity tracking, background sync and the "pre-save" download. Renders nothing. */
export function OfflineBoot() {
  useEffect(() => {
    startOffline();
    if (process.env.NODE_ENV === "production" && !DEMO && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    // Tell the server about crashes in the browser so they show up in the admin's error list.
    let sent = 0;
    const report = (message: string, detail?: string) => {
      if (sent++ >= 5 || !navigator.onLine) return;
      void fetch("/api/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.slice(0, 900), detail: detail?.slice(0, 5000), path: location.pathname }),
        keepalive: true,
      }).catch(() => undefined);
    };
    const onError = (e: ErrorEvent) => report(e.message || "Script error", e.error?.stack);
    const onRejection = (e: PromiseRejectionEvent) =>
      report(e.reason instanceof Error ? e.reason.message : String(e.reason), e.reason instanceof Error ? e.reason.stack : undefined);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}

/** Always-visible link status: online / syncing / changes waiting / offline. */
export function ConnectionBadge({ compact }: { compact?: boolean }) {
  const { online, syncing, pending } = useConnection();
  const view = DEMO
    ? { icon: <Check size={14} strokeWidth={3} />, label: "Демо", cls: "bg-surface-2 text-ink-2", hint: "Демо без сервера: дані вигадані, а ваші зміни зберігаються лише в цьому браузері" }
    : !online
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
      {(!compact || DEMO || !online || pending > 0) && <span>{view.label}</span>}
      {compact && !DEMO && online && !pending && <span>Онлайн</span>}
    </button>
  );
}
