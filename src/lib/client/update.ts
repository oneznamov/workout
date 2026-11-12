"use client";

/**
 * A new version was deployed while the app is open. Left alone, the first tap on a link
 * would turn into a full page load right under the finger. Instead the app refreshes itself
 * at a moment nobody is looking: when it goes to the background, or right after it comes
 * back (or opens) before anything was touched. Never in the middle of a workout.
 */
const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "";
const LAST = "wk:reloaded";
let stale = false;
let shownAt = 0;
let touched = false;
let wired = false;

const inWorkout = () => /^\/(workouts\/[0-9a-f-]{36}|train)/i.test(location.pathname) || document.body.dataset.immersive != null;

function reloadIfQuiet() {
  if (!stale || inWorkout()) return;
  const justShown = !touched && performance.now() - shownAt < 5000;
  if (!document.hidden && !justShown) return;
  try {
    // One refresh per minute at most — never a loop.
    if (Date.now() - Number(sessionStorage.getItem(LAST) ?? 0) < 60_000) return;
    sessionStorage.setItem(LAST, String(Date.now()));
  } catch {
    return;
  }
  location.reload();
}

/** Called with the build id the server reports. */
export function noteServerBuild(build: string | null | undefined) {
  if (!wired && typeof window !== "undefined") {
    wired = true;
    shownAt = performance.now();
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        shownAt = performance.now();
        touched = false;
      }
      reloadIfQuiet();
    });
    window.addEventListener("pointerdown", () => (touched = true), { capture: true, passive: true });
  }
  if (!build || !BUILD || build === BUILD) return;
  stale = true;
  reloadIfQuiet();
}
