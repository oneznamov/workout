/**
 * Turns the running demo into plain files: builds the app, starts it on the demo database, opens
 * every screen as the demo athlete and saves what the server sent. The result (./demo-out) can be
 * put on any static host — GitHub Pages serves it as is.
 */
import type { ChildProcess } from "node:child_process";
import { cpSync, createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join } from "node:path";
import { SignJWT } from "jose";
import postgres from "postgres";

export const OUT = "demo-out";
const DIST = ".next-demo";
const PORT = Number(process.env.DEMO_PORT ?? 3977);
/** "/workout" when the site is served from https://<user>.github.io/workout/; empty at the root of a domain. */
const BASE = (process.env.DEMO_BASE_PATH ?? "").replace(/\/$/, "");
const MAX_PAGES = 900;
/** How many filtered views (?range=…, ?t=…) of one screen are saved. */
const MAX_VARIANTS = 80;

type Tools = {
  env: (extra: Record<string, string>) => NodeJS.ProcessEnv;
  run: (cmd: string, args: string[], env?: NodeJS.ProcessEnv) => Promise<void>;
  start: (cmd: string, args: string[], env?: NodeJS.ProcessEnv) => ChildProcess;
  setup: () => Promise<void>;
  url: string;
};

const slug = (query: string) => query.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
const fileOf = (path: string, query: string) => `${path === "/" ? "/index" : path}${query ? `__${slug(query)}` : ""}.html`;
const save = (file: string, body: string | Buffer) => {
  const full = join(OUT, file);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body);
};

export async function buildDemo(t: Tools) {
  const sql = postgres(t.url, { max: 1, prepare: false, onnotice: () => undefined });
  const hasTables = (await sql`select to_regclass('public.users') as t`)[0].t;
  if (!hasTables || (await sql`select count(*)::int as n from users`)[0].n === 0) await t.setup();
  const [user] = await sql`select id, session_version from users where username = 'demo'`;
  await sql.end();
  if (!user) throw new Error("The demo database has no «demo» user — it must be filled by `pnpm demo:setup`, not hold real data.");

  const env = t.env({
    NEXT_PUBLIC_DEMO: "1",
    NEXT_PUBLIC_BASE_PATH: BASE,
    NEXT_DIST_DIR: DIST,
    NEXT_PUBLIC_REPO_URL: process.env.DEMO_REPO_URL ?? "",
    NODE_ENV: "production",
  });
  // DEMO_SKIP_BUILD=1 reuses the last build — handy while working on the demo itself.
  if (!process.env.DEMO_SKIP_BUILD) await t.run("pnpm", ["exec", "next", "build"], env);

  const server = t.start("pnpm", ["exec", "next", "start", "--port", String(PORT)], env);
  try {
    const origin = `http://localhost:${PORT}`;
    for (let i = 0; ; i++) {
      if (await fetch(`${origin}${BASE}/login`).then((r) => r.ok, () => false)) break;
      if (i > 120) throw new Error("The app did not start");
      await new Promise((r) => setTimeout(r, 500));
    }
    const token = await new SignJWT({ sub: user.id, sv: user.session_version })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(env.AUTH_SECRET));
    const get = (path: string) => fetch(`${origin}${BASE}${path === "/" && BASE ? "" : path}`, { headers: { cookie: `session=${token}` }, redirect: "manual" });

    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });

    // ── Every screen reachable from the home page ──
    const pages = new Map<string, { path: string; query: string; html: string }>();
    const variants = new Map<string, Map<string, string>>(); // path → query → file
    const seen = new Set<string>(["/"]);
    const queue = ["/"];
    const visit = async (key: string) => {
      const [path, query = ""] = key.split("?");
      const res = await get(key);
      if (res.status >= 300 && res.status < 400) {
        const to = new URL(res.headers.get("location") ?? "/", origin);
        const target = `${to.pathname}${to.search}`;
        if (!query) save(fileOf(path, ""), `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${target}"><script>location.replace(${JSON.stringify(target)})</script>`);
        enqueue(target.startsWith(`${BASE}/`) ? target.slice(BASE.length) : target);
        return;
      }
      if (!res.ok || !res.headers.get("content-type")?.includes("text/html")) {
        if (res.status !== 404) console.warn(`  ! ${res.status} ${key}`);
        return;
      }
      const html = await res.text();
      pages.set(key, { path, query, html });
      if (query) variants.set(path, (variants.get(path) ?? new Map()).set(query, fileOf(path, query)));
      for (const m of html.matchAll(/href="([^"#]+)(?:#[^"]*)?"/g)) {
        const href = m[1].replace(/&amp;/g, "&");
        // "?w=4": another view of this same screen.
        if (href.startsWith("?")) {
          enqueue(`${path}${href}`);
          continue;
        }
        if (!href.startsWith("/") || href.startsWith("//")) continue;
        if (BASE && !href.startsWith(`${BASE}/`) && href !== BASE) continue;
        enqueue(href.slice(BASE.length) || "/");
      }
    };
    const perPath = new Map<string, number>();
    function enqueue(key: string) {
      const [path, query] = key.split("?");
      if (seen.has(key) || seen.size >= MAX_PAGES) return;
      if (/^\/(api|_next|login|invite|reset|exercise-media|pwa-icon)(\/|$)/.test(path) || extname(path)) return;
      if (query) {
        const n = perPath.get(path) ?? 0;
        if (n >= MAX_VARIANTS) return;
        perPath.set(path, n + 1);
      }
      seen.add(key);
      queue.push(key);
    }
    while (queue.length) await Promise.all(queue.splice(0, 6).map(visit));

    // ── Save them, each with a few lines that make ?filters work without a server ──
    for (const { path, query, html } of pages.values()) {
      const boot = query
        ? `history.replaceState(null,"",${JSON.stringify(`${BASE}${path}?${query}`)}+location.hash)`
        : `var f=${JSON.stringify(Object.fromEntries(variants.get(path) ?? []))}[location.search.slice(1)];if(f){document.documentElement.style.visibility="hidden";location.replace(${JSON.stringify(BASE)}+f+location.hash)}`;
      save(fileOf(path, query), html.replace(/<head>/, `<head><script>${boot}</script>`));
    }

    // ── What the screens load besides themselves ──
    for (const asset of ["/manifest.webmanifest", "/icon", "/apple-icon", "/pwa-icon/192", "/pwa-icon/512"]) {
      const res = await get(asset);
      if (res.ok) save(asset, Buffer.from(await res.arrayBuffer()));
    }
    const offline = await get("/api/offline");
    if (offline.ok) save("/demo/offline.json", await offline.text());
    cpSync(join(DIST, "static"), join(OUT, "_next/static"), { recursive: true });
    if (existsSync("public")) cpSync("public", OUT, { recursive: true });
    save("/.nojekyll", "");
    save("/404.html", `<!doctype html><meta charset="utf-8"><title>Workout demo</title><meta http-equiv="refresh" content="0;url=${BASE}/"><a href="${BASE}/">Workout demo</a>`);
    console.log(`✓ ${pages.size} screens saved to ./${OUT}${BASE ? ` (to be served under ${BASE}/)` : ""}`);
  } finally {
    server.kill("SIGTERM");
  }
}

/** Serves ./demo-out the way GitHub Pages does (`/page` → `page.html`), under the same sub-path. */
export function previewDemo(port = Number(process.env.DEMO_PORT ?? 3978)) {
  const types: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
  const isFile = (f: string) => existsSync(f) && statSync(f).isFile();
  createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    if (BASE && !path.startsWith(`${BASE}/`) && path !== BASE) {
      res.writeHead(302, { location: `${BASE}/` }).end();
      return;
    }
    path = path.slice(BASE.length) || "/";
    const file = [join(OUT, path), join(OUT, `${path}.html`), join(OUT, path, "index.html")].find(isFile);
    if (!file || !join(OUT, path).startsWith(OUT)) {
      res.writeHead(404, { "content-type": types[".html"] });
      createReadStream(join(OUT, "404.html")).pipe(res);
      return;
    }
    res.writeHead(200, { "content-type": types[extname(file)] ?? (extname(file) ? "application/octet-stream" : "image/png") });
    createReadStream(file).pipe(res);
  }).listen(port, () => console.log(`Demo: http://localhost:${port}${BASE}/`));
}
