/**
 * Service worker. Makes the app installable and keeps the offline workout screen (/train)
 * and its assets on the device. When the server cannot be reached, any page falls back
 * to that screen, where workouts run from device storage.
 */
const VERSION = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

const source = /* js */ `
const VERSION = ${JSON.stringify(VERSION)};
const STATIC = "wk-static-" + VERSION;
const SHELL = "wk-shell-" + VERSION;

async function warm() {
  const res = await fetch("/train", { credentials: "same-origin", cache: "no-store" });
  if (!res.ok || res.redirected) return;
  const html = await res.clone().text();
  await (await caches.open(SHELL)).put("/train", res);
  const urls = new Set(["/pwa-icon/192", "/apple-icon"]);
  for (const m of html.matchAll(/\\/_next\\/static\\/[^"'\\\\\\s<>)]+/g)) urls.add(m[0]);
  for (const m of html.matchAll(/(?<![\\w\\/])static\\/(?:chunks|css|media)\\/[^"'\\\\\\s<>)]+/g)) urls.add("/_next/" + m[0]);
  const cache = await caches.open(STATIC);
  await Promise.all(
    [...urls].map(async (u) => {
      try {
        if (await cache.match(u, { ignoreSearch: true })) return;
        const r = await fetch(u);
        if (r.ok) await cache.put(u, r);
      } catch {}
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(warm().catch(() => undefined).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("wk-") && !key.endsWith(VERSION)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "warm") event.waitUntil(warm().catch(() => undefined));
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

async function navigate(request, url) {
  try {
    return await withTimeout(fetch(request), 6000);
  } catch {
    const shell = await (await caches.open(SHELL)).match("/train");
    if (!shell) {
      return new Response(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#000;color:#fff;font:16px -apple-system,system-ui,sans-serif;padding:2rem"><h1>Немає звʼязку</h1><p>Відкрийте застосунок один раз зі звʼязком, щоб він працював офлайн.</p>',
        { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }
    if (url.pathname === "/train") return shell;
    const m = url.pathname.match(/^\\/workouts\\/([0-9a-f-]{36})$/i);
    return Response.redirect(m ? "/train#" + m[1] : "/train", 302);
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pwa-icon/") || url.pathname === "/apple-icon") {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === "navigate") event.respondWith(navigate(request, url));
});
`;

export function GET() {
  return new Response(source, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
