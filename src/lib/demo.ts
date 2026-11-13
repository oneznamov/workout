/**
 * The static demo (GitHub Pages): every screen is saved as a file, there is no server behind it.
 * Both values are fixed at build time by `pnpm demo:build`; in a normal build DEMO is false.
 */
export const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";
/** Where the site lives when it is not at the root of its host, e.g. "/workout". */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "";
