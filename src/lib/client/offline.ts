"use client";

import { BASE_PATH } from "@/lib/demo";
import { useSyncExternalStore } from "react";
import { dayOf } from "@/lib/format";
import { noteServerBuild } from "./update";
import type { CExerciseInfo, CLast, CWorkout, OfflineBundle, WorkoutSnapshot } from "@/lib/shape";
import type { WorkoutStatus } from "@/db/schema";

/**
 * Device-side store. Every workout being edited lives in localStorage first and is pushed
 * to the server when there is a connection, so a session survives a dead gym network.
 */

const W = "wk:w:";
const BUNDLE = "wk:bundle";
const METRICS = "wk:metrics";

export type LocalWorkout = {
  workout: CWorkout;
  /** true while the device holds changes the server has not confirmed */
  dirty: boolean;
  deletedExerciseIds: string[];
  deletedSetIds: string[];
  /** bumps on every local edit — lets a finished upload tell if it is already stale */
  rev: number;
};

export type MetricEntry = { metric: "body_mass" | "body_fat_percentage" | "lean_body_mass"; day: string; value: number };
type BundleData = Pick<OfflineBundle, "exercises" | "last" | "fetchedAt">;

const hasStorage = () => typeof window !== "undefined" && typeof localStorage !== "undefined";

function read<T>(key: string): T | null {
  if (!hasStorage()) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — the in-memory state still works */
  }
}

// ───────────────────────── Connection state ─────────────────────────

export type Conn = { online: boolean; syncing: boolean; pending: number };
const SERVER_CONN: Conn = { online: true, syncing: false, pending: 0 };
let conn: Conn = SERVER_CONN;
const connListeners = new Set<() => void>();
const dataListeners = new Set<() => void>();

function setConn(patch: Partial<Conn>) {
  const next = { ...conn, ...patch };
  if (next.online === conn.online && next.syncing === conn.syncing && next.pending === conn.pending) return;
  conn = next;
  connListeners.forEach((l) => l());
}
const subscribeConn = (cb: () => void) => {
  connListeners.add(cb);
  return () => connListeners.delete(cb);
};

/** Live connection/sync status for the badge. */
export function useConnection(): Conn {
  return useSyncExternalStore(subscribeConn, () => conn, () => SERVER_CONN);
}

/** Notifies when any locally stored workout changes (used by the offline hub). */
export function subscribeLocal(cb: () => void) {
  dataListeners.add(cb);
  return () => {
    dataListeners.delete(cb);
  };
}

function recount() {
  setConn({ pending: listLocal().filter((l) => l.dirty).length + (read<MetricEntry[]>(METRICS)?.length ?? 0) });
  dataListeners.forEach((l) => l());
}

// ───────────────────────── Local workouts ─────────────────────────

export const readLocal = (id: string) => read<LocalWorkout>(W + id);

export function writeLocal(id: string, rec: LocalWorkout) {
  write(W + id, rec);
  recount();
}

export function removeLocal(id: string) {
  if (!hasStorage()) return;
  localStorage.removeItem(W + id);
  recount();
}

export function listLocal(): LocalWorkout[] {
  if (!hasStorage()) return [];
  const out: LocalWorkout[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(W)) continue;
    const rec = read<LocalWorkout>(key);
    if (rec?.workout?.id) out.push(rec);
  }
  return out;
}

export const readBundle = () => read<BundleData>(BUNDLE);

let listCache: { key: string; value: LocalWorkout[] } = { key: "", value: [] };
const EMPTY_LIST: LocalWorkout[] = [];
function snapshotList() {
  const list = listLocal();
  const key = list.map((l) => `${l.workout.id}:${l.rev}:${l.dirty}:${l.workout.status}:${l.workout.updatedAt}`).join("|");
  if (key !== listCache.key) listCache = { key, value: list };
  return listCache.value;
}

/** Every workout currently stored on this device, live. */
export function useLocalWorkouts() {
  return useSyncExternalStore(subscribeLocal, snapshotList, () => EMPTY_LIST);
}

export function newWorkout(status: WorkoutStatus, name?: string): CWorkout {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: name ?? (status === "template" ? "Новий шаблон" : "Тренування"),
    status,
    scheduledFor: status === "planned" ? dayOf() : null,
    startedAt: status === "in_progress" ? now : null,
    endedAt: null,
    pausedSec: 0,
    pausedAt: null,
    notes: null,
    effort: null,
    mood: null,
    comment: null,
    updatedAt: now,
    exercises: [],
    health: [],
  };
}

/** Copies a workout with fresh ids (start from a template, repeat a session…). */
export function cloneWorkout(src: CWorkout, status: WorkoutStatus): CWorkout {
  const base = newWorkout(status, src.name);
  return {
    ...base,
    notes: src.notes,
    exercises: src.exercises.map((e) => ({
      ...e,
      id: crypto.randomUUID(),
      sets: e.sets
        .filter((s) => src.status !== "completed" || s.completed)
        .map((s) => ({ ...s, id: crypto.randomUUID(), completed: false, completedAt: null })),
    })),
  };
}

// ───────────────────────── Sync ─────────────────────────

export type PushResult = { status: "ok" | "clean" | "offline" | "error" | "auth"; workout?: CWorkout };

const chains = new Map<string, Promise<PushResult>>();

async function request(url: string, init: RequestInit, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

async function doPush(id: string): Promise<PushResult> {
  const local = readLocal(id);
  if (!local) return { status: "clean" };
  if (!local.dirty) return { status: "clean", workout: local.workout };
  const { rev } = local;
  const body: WorkoutSnapshot = {
    workout: local.workout,
    deletedExerciseIds: local.deletedExerciseIds,
    deletedSetIds: local.deletedSetIds,
  };
  setConn({ syncing: true });
  try {
    const res = await request(`/api/workouts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setConn({ online: true });
    if (res.status === 401) return { status: "auth" };
    if (!res.ok) return { status: "error" };
    const fresh = (await res.json()) as CWorkout;
    const now = readLocal(id);
    // Only adopt the server copy if nothing changed locally while the upload was in flight.
    if (now && now.rev === rev) {
      writeLocal(id, { workout: fresh, dirty: false, deletedExerciseIds: [], deletedSetIds: [], rev });
      return { status: "ok", workout: fresh };
    }
    return { status: "ok" };
  } catch {
    setConn({ online: false });
    return { status: "offline" };
  } finally {
    setConn({ syncing: false });
    recount();
  }
}

/** Uploads one workout; calls for the same workout run one after another. */
export function pushWorkout(id: string): Promise<PushResult> {
  const prev = chains.get(id) ?? Promise.resolve({ status: "clean" } as PushResult);
  const next = prev.catch(() => undefined).then(() => doPush(id));
  chains.set(id, next);
  return next;
}

export function queueMetric(entry: MetricEntry) {
  const list = (read<MetricEntry[]>(METRICS) ?? []).filter((m) => !(m.metric === entry.metric && m.day === entry.day));
  write(METRICS, [...list, entry]);
  recount();
}

async function flushMetrics() {
  const entries = read<MetricEntry[]>(METRICS);
  if (!entries?.length) return true;
  try {
    const res = await request("/api/metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    if (!res.ok) return false;
    localStorage.removeItem(METRICS);
    recount();
    return true;
  } catch {
    setConn({ online: false });
    return false;
  }
}

/** Pushes everything the device is still holding. Safe to call often. */
export async function syncAll() {
  for (const l of listLocal()) if (l.dirty) await pushWorkout(l.workout.id);
  await flushMetrics();
}

export async function checkConnection() {
  try {
    const res = await request("/api/ping", {}, 6000);
    setConn({ online: res.ok || res.status < 500 });
    if (res.ok) noteServerBuild(((await res.json().catch(() => null)) as { build?: string } | null)?.build);
  } catch {
    setConn({ online: false });
  }
  return conn.online;
}

/**
 * "Pre-save": downloads planned workouts, templates, the exercise library and last results
 * so they can be opened with no connection.
 */
export async function refreshBundle() {
  try {
    const res = await request("/api/offline", {});
    if (!res.ok) return false;
    const bundle = (await res.json()) as OfflineBundle;
    write(BUNDLE, { exercises: bundle.exercises, last: bundle.last, fetchedAt: bundle.fetchedAt } satisfies BundleData);
    const keep = new Set(bundle.workouts.map((w) => w.id));
    for (const w of bundle.workouts) {
      const local = readLocal(w.id);
      if (!local || !local.dirty) {
        write(W + w.id, { workout: w, dirty: false, deletedExerciseIds: [], deletedSetIds: [], rev: local?.rev ?? 0 });
      }
    }
    // Drop synced copies the server no longer lists as open (finished, deleted elsewhere).
    for (const l of listLocal()) if (!l.dirty && !keep.has(l.workout.id)) localStorage.removeItem(W + l.workout.id);
    recount();
    setConn({ online: true });
    navigator.serviceWorker?.controller?.postMessage({ type: "warm" });
    return true;
  } catch {
    setConn({ online: false });
    return false;
  }
}

/**
 * Full-page navigation on purpose: unlike the client router it does not need the server,
 * so the service worker can answer it from the device when there is no connection.
 */
export function hardNavigate(url: string) {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full page load is the point here
  window.location.href = `${BASE_PATH}${url}`;
}

let started = false;

/** Wires up connectivity tracking and background sync once per page load. */
export function startOffline() {
  if (started || typeof window === "undefined") return;
  started = true;
  setConn({ online: navigator.onLine });
  recount();
  const resync = async () => {
    if (await checkConnection()) {
      await syncAll();
      await refreshBundle();
    }
  };
  window.addEventListener("online", resync);
  window.addEventListener("storage", recount);
  window.addEventListener("offline", () => setConn({ online: false }));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void resync();
  });
  setInterval(() => {
    if (document.hidden) return;
    void checkConnection().then((ok) => {
      if (ok && conn.pending > 0) void syncAll();
    });
  }, 30000);
  void resync();
}

export type { CExerciseInfo, CLast };
