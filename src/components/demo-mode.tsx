"use client";

import { useEffect } from "react";
import { BASE_PATH, REPO_URL } from "@/lib/demo";

/**
 * Only in the static demo. There is no server there, so everything that would talk to one is
 * answered right in the browser:
 *  - saving (server actions) — a note that the demo does not keep changes;
 *  - the workout screen's own sync — "no connection", which puts the app into its real offline
 *    mode: a workout can be started and logged, and it stays in this browser;
 *  - moving between screens — plain page loads instead of the client router.
 */
class DemoError extends Error {
  constructor() {
    super("demo");
    this.name = "DemoError";
  }
}
export const isDemoError = (e: unknown) => e instanceof Error && (e.name === "DemoError" || e.message === "demo");

let noteTimer: ReturnType<typeof setTimeout> | undefined;
export function demoNote(text = "Це демо: зміни тут не зберігаються.") {
  if (typeof document === "undefined") return;
  let el = document.getElementById("demo-note");
  if (!el) {
    el = document.createElement("div");
    el.id = "demo-note";
    el.setAttribute("role", "status");
    el.style.cssText =
      "position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 5.5rem);transform:translateX(-50%);z-index:1000;max-width:min(92vw,28rem);" +
      "padding:.7rem 1rem;border-radius:16px;background:#1c1c1e;color:#fff;font:500 14px/1.35 system-ui,sans-serif;" +
      "box-shadow:0 8px 30px rgba(0,0,0,.55),inset 0 0 0 1px rgba(255,255,255,.12);text-align:center";
    document.body.appendChild(el);
  }
  el.textContent = text;
  if (REPO_URL) {
    const a = document.createElement("a");
    a.href = REPO_URL;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.textContent = " Розгорнути свій →";
    a.style.cssText = "color:#c8f560;white-space:nowrap";
    el.appendChild(a);
  }
  el.style.display = "block";
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => el && (el.style.display = "none"), 4500);
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function install() {
  const w = window as unknown as { __demo?: boolean };
  if (w.__demo) return;
  w.__demo = true;
  const real = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const req = input instanceof Request ? input : null;
    const url = new URL(req ? req.url : String(input), location.href);
    const headers = new Headers(init?.headers ?? req?.headers);
    const method = (init?.method ?? req?.method ?? "GET").toUpperCase();
    if (url.origin !== location.origin) return real(input, init);

    // A server action: nothing to run it.
    if (headers.has("next-action")) {
      demoNote();
      // Whatever was waiting for the answer (a spinner, a disabled button) would wait forever:
      // put the screen back as it was. Not right after a page load, so nothing can loop.
      if (performance.now() > 3000) {
        setTimeout(() => {
          try {
            sessionStorage.setItem("demo-refused", "1");
          } catch {
            /* private mode */
          }
          location.reload();
        }, 1600);
      }
      throw new DemoError();
    }
    // The client router asking the server for a screen: load the saved page instead.
    if (headers.has("rsc")) {
      if (!headers.has("next-router-prefetch") && !headers.has("next-router-segment-prefetch")) {
        url.searchParams.delete("_rsc");
        location.assign(url.href);
        return new Promise<Response>(() => undefined);
      }
      return new Response(null, { status: 404 });
    }

    const path = url.pathname.startsWith(`${BASE_PATH}/`) ? url.pathname.slice(BASE_PATH.length) : url.pathname;
    if (!path.startsWith("/api/")) return real(input, init);
    if (path === "/api/ping") return json({ ok: true });
    if (path === "/api/offline" && method === "GET") return real(`${BASE_PATH}/demo/offline.json`);
    if (path === "/api/client-error") return json({ ok: true });
    if (path.startsWith("/api/workouts/")) {
      // "No connection": the workout stays on this device, exactly as it does in a gym with no signal.
      if (method !== "GET") throw new TypeError("demo: offline");
      return json({ error: "not_found" }, 404);
    }
    if (path.startsWith("/api/push/")) return json({ error: "disabled" }, 404);
    if (method !== "GET") demoNote();
    return json({ error: "demo" }, 503);
  };

  // Links: a plain page load (the saved screens are separate files).
  window.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.origin !== location.origin) return;
      const path = a.pathname.startsWith(`${BASE_PATH}/`) ? a.pathname.slice(BASE_PATH.length) : a.pathname;
      if (a.hasAttribute("download") || path.startsWith("/api/")) {
        e.preventDefault();
        e.stopPropagation();
        demoNote("Це демо: вивантаження даних працює у власному екземплярі.");
        return;
      }
      if (a.pathname === location.pathname && a.search === location.search && a.hash) return;
      e.preventDefault();
      e.stopPropagation();
      location.assign(a.href);
    },
    true,
  );

  // A save that was refused: say so quietly instead of leaving an error in the console.
  window.addEventListener("unhandledrejection", (e) => {
    if (isDemoError(e.reason)) e.preventDefault();
  });
}

if (typeof window !== "undefined") install();

export function DemoMode() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem("demo-refused")) {
        sessionStorage.removeItem("demo-refused");
        demoNote();
        return;
      }
      if (sessionStorage.getItem("demo-hello")) return;
      sessionStorage.setItem("demo-hello", "1");
    } catch {
      /* private mode */
    }
    demoNote("Демо з вигаданими даними. Тренування можна вести — воно збережеться лише в цьому браузері.");
  }, []);
  return null;
}
