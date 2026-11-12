"use client";

/**
 * Notifications on this device. Turned on once (the browser asks for permission), after which
 * the app can announce the end of a rest even when the phone is locked.
 */
const FLAG = "wk:push";
const JSON_HEADERS = { "Content-Type": "application/json" };

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export function pushOn() {
  try {
    return pushSupported() && localStorage.getItem(FLAG) === "1" && Notification.permission === "granted";
  } catch {
    return false;
  }
}

function keyBytes(base64url: string) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export type PushResult = "on" | "denied" | "unsupported" | "error";

export async function enablePush(): Promise<PushResult> {
  if (!pushSupported()) return "unsupported";
  try {
    if ((await Notification.requestPermission()) !== "granted") return "denied";
    const registration = await navigator.serviceWorker.ready;
    const { key } = (await fetch("/api/push/subscribe").then((r) => r.json())) as { key: string };
    const options = { userVisibleOnly: true, applicationServerKey: keyBytes(key) };
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe(options);
    } else {
      // A subscription made for other keys is useless — replace it.
      const current = subscription.options.applicationServerKey;
      const same = current && btoa(String.fromCharCode(...new Uint8Array(current))) === btoa(String.fromCharCode(...options.applicationServerKey));
      if (!same) {
        await subscription.unsubscribe();
        subscription = await registration.pushManager.subscribe(options);
      }
    }
    const saved = await fetch("/api/push/subscribe", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(subscription.toJSON()) });
    if (!saved.ok) return "error";
    localStorage.setItem(FLAG, "1");
    return "on";
  } catch {
    return "error";
  }
}

export async function disablePush() {
  try {
    localStorage.removeItem(FLAG);
    const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (!subscription) return;
    await fetch("/api/push/subscribe", { method: "DELETE", headers: JSON_HEADERS, body: JSON.stringify({ endpoint: subscription.endpoint }) });
    await subscription.unsubscribe();
  } catch {
    /* nothing to undo */
  }
}

const post = (body: unknown) => void fetch("/api/push/rest", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body), keepalive: true }).catch(() => undefined);

/** A rest started or changed: the server will announce its end unless told otherwise. */
export function armRestPush(endsAt: number, next: string) {
  if (pushOn()) post({ endsAt: Math.round(endsAt), next, path: location.pathname });
}

/** The rest ended on screen, or was skipped: no notification needed. */
export function cancelRestPush() {
  if (pushOn()) post({ cancel: true });
}
