/**
 * The demo: the real app running on a throwaway database filled with a made-up athlete.
 *
 *   pnpm demo:setup   — create the tables and the demo data (the database must be empty)
 *   pnpm demo:dev     — run the app on that database (sign in: demo / demo-demo)
 *   pnpm demo:build   — save every screen as static files into ./demo-out (for GitHub Pages)
 *   pnpm demo:preview — look at ./demo-out the way GitHub Pages would serve it
 *   pnpm demo:publish — put ./demo-out on the local `gh-pages` branch (then `git push origin gh-pages`)
 *
 * The database comes from DEMO_DATABASE_URL (the environment or a git-ignored `.env.demo` file).
 * DATABASE_URL from .env.local is never used here, so the demo cannot reach real data.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { buildDemo, OUT, previewDemo } from "./demo-build";

function demoDatabaseUrl() {
  let url = process.env.DEMO_DATABASE_URL;
  if (!url && existsSync(".env.demo")) url = /^DEMO_DATABASE_URL=(.+)$/m.exec(readFileSync(".env.demo", "utf8"))?.[1]?.trim().replace(/^["']|["']$/g, "");
  if (!url) {
    console.error("DEMO_DATABASE_URL is not set.\nPoint it at an empty throwaway Postgres database (in the environment or in a `.env.demo` file), e.g.\n  DEMO_DATABASE_URL=postgres://postgres:postgres@localhost:5432/workout_demo");
    process.exit(1);
  }
  if (url === process.env.DATABASE_URL) {
    console.error("DEMO_DATABASE_URL is the same as DATABASE_URL — the demo needs its own, empty database.");
    process.exit(1);
  }
  return url;
}

/** Only setup, dev and build talk to a database; looking at or publishing the saved files does not. */
const url = ["preview", "publish"].includes(process.argv[2]) ? "" : demoDatabaseUrl();

/**
 * Replaces the `gh-pages` branch with one commit holding ./demo-out — GitHub Pages serves that
 * branch as it is (Settings → Pages → Deploy from a branch → gh-pages). The working tree and the
 * current branch are not touched; nothing is pushed.
 */
function publish() {
  if (!existsSync(`${OUT}/index.html`)) throw new Error(`./${OUT} is empty — run \`pnpm demo:build\` first.`);
  const gitDir = execFileSync("git", ["rev-parse", "--absolute-git-dir"], { encoding: "utf8" }).trim();
  const index = `${gitDir}/demo-index`;
  const git = (args: string[], env: Record<string, string> = {}) => execFileSync("git", args, { env: { ...process.env, ...env }, encoding: "utf8", maxBuffer: 1 << 28 }).trim();
  rmSync(index, { force: true });
  execFileSync("git", ["add", "-A", "--force", "."], { cwd: OUT, env: { ...process.env, GIT_DIR: gitDir, GIT_WORK_TREE: resolve(OUT), GIT_INDEX_FILE: index } });
  const tree = git(["write-tree"], { GIT_INDEX_FILE: index });
  rmSync(index, { force: true });
  const commit = git(["commit-tree", tree, "-m", `Demo built from ${git(["rev-parse", "--short", "HEAD"])}`]);
  git(["update-ref", "refs/heads/gh-pages", commit]);
  console.log(`✓ gh-pages → ${commit.slice(0, 7)}. Publish it with: git push --force origin gh-pages`);
}
/** Signs the demo sessions; made up on the spot unless one is given (dev keeps a fixed one so a sign-in survives restarts). */
const secret = process.env.DEMO_AUTH_SECRET ?? (process.argv[2] === "dev" ? "demo-secret-demo-secret-demo-secret-demo" : randomBytes(32).toString("hex"));
/** Everything the app reads, pointed at the demo database. Set explicitly so .env.local cannot win. */
export const demoEnv = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  ...process.env,
  DATABASE_URL: url,
  DATABASE_URL_UNPOOLED: url,
  DEMO_DATABASE_URL: url,
  AUTH_SECRET: secret,
  ...extra,
});

export function start(cmd: string, args: string[], env = demoEnv()): ChildProcess {
  return spawn(cmd, args, { stdio: "inherit", env });
}
export const run = (cmd: string, args: string[], env = demoEnv()) =>
  new Promise<void>((resolve, reject) => {
    start(cmd, args, env).on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited with ${code}`))));
  });

export async function setup() {
  await run("pnpm", ["exec", "drizzle-kit", "migrate"]);
  await run("pnpm", ["exec", "tsx", "scripts/seed.ts"]);
  await run("pnpm", ["exec", "tsx", "scripts/demo-seed.ts"]);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "setup") await setup();
  else if (command === "dev") await run("pnpm", ["exec", "next", "dev", ...rest]);
  else if (command === "build") await buildDemo({ env: demoEnv, run, start, setup, url });
  else if (command === "preview") previewDemo();
  else if (command === "publish") publish();
  else {
    console.error("Usage: pnpm demo:setup | demo:dev | demo:build | demo:preview | demo:publish");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
