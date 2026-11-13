import "server-only";
import { and, eq } from "drizzle-orm";
import { generateVAPIDKeys, sendNotification } from "web-push";
import { db } from "@/db";
import { appConfig, pushSubscriptions, users } from "@/db/schema";
import { seal, unseal } from "./crypto";

/**
 * Web push: lets the app speak when it is not on screen — first of all "rest is over" on a
 * locked phone. The signing keys are created on first use and kept in the database (the
 * private one sealed), so nothing has to be configured on the hosting side.
 */

type Keys = { publicKey: string; privateKey: string };
let cached: Keys | null = null;

async function vapid(): Promise<Keys> {
  if (cached) return cached;
  const read = async () => {
    const [row] = await db.select().from(appConfig).where(eq(appConfig.key, "vapid"));
    if (!row) return { stored: false, keys: null };
    const { publicKey, privateKey } = JSON.parse(row.value) as { publicKey: string; privateKey: string };
    const opened = unseal(privateKey);
    return { stored: true, keys: opened ? { publicKey, privateKey: opened } : null };
  };
  const first = await read();
  let keys = first.keys;
  if (!keys) {
    const fresh = generateVAPIDKeys();
    const value = JSON.stringify({ publicKey: fresh.publicKey, privateKey: seal(fresh.privateKey) });
    const insert = db.insert(appConfig).values({ key: "vapid", value });
    // Keys sealed under another server secret cannot be opened again — replace them. Otherwise
    // another request may have won the race, so keep whatever is stored.
    if (first.stored) await insert.onConflictDoUpdate({ target: appConfig.key, set: { value } });
    else await insert.onConflictDoNothing();
    keys = (await read()).keys ?? fresh;
  }
  cached = keys;
  return keys;
}

export const pushPublicKey = async () => (await vapid()).publicKey;

/** The address push services may use to reach the site's owner: the site itself. */
const contact = (origin: string) => `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? new URL(origin).host}`;

export async function savePushSubscription(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const values = { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth };
  // A device already registered by another account stays theirs.
  await db
    .insert(pushSubscriptions)
    .values(values)
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values, setWhere: eq(pushSubscriptions.userId, userId) });
}

export async function removePushSubscription(userId: string, endpoint: string) {
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)));
}

/**
 * Browsers only ever hand out addresses of their vendor's push service. Anything else is refused,
 * so the server cannot be pointed at an arbitrary (e.g. internal) host.
 */
const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/;
export function isPushEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.test(u.hostname);
  } catch {
    return false;
  }
}

export type PushMessage = { title: string; body: string; tag: string; url: string };

/** Sends a notification to every device of the user; devices that no longer accept it are forgotten. */
export async function sendPush(userId: string, message: PushMessage, origin: string) {
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  if (subs.length === 0) {
    await notePush(userId, { event: "no devices", tag: message.tag });
    return 0;
  }
  const keys = await vapid();
  let sent = 0;
  const failed: (number | string)[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(message), {
          vapidDetails: { subject: contact(origin), publicKey: keys.publicKey, privateKey: keys.privateKey },
          TTL: 60,
          urgency: "high",
        });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        failed.push(status ?? "network");
        if (status === 404 || status === 410) await removePushSubscription(userId, s.endpoint);
      }
    }),
  );
  await notePush(userId, { event: "sent", tag: message.tag, devices: subs.length, sent, failed });
  return sent;
}

/** The last thing that happened to a user's notifications — kept to tell "not sent" from "not shown". */
async function notePush(userId: string, what: Record<string, unknown>) {
  const value = JSON.stringify({ at: new Date().toISOString(), ...what });
  console.log(`[push] ${value}`);
  await db
    .insert(appConfig)
    .values({ key: `push-last:${userId}`, value })
    .onConflictDoUpdate({ target: appConfig.key, set: { value } })
    .catch(() => undefined);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** The longest wait one request can hold; a longer rest simply gets no push. */
export const REST_PUSH_MAX_MS = 285_000;

/** Remembers which rest countdown is running. Returns its id, or null when it is too long to wait for. */
export async function armRestPush(userId: string, at: number) {
  if (at - Date.now() > REST_PUSH_MAX_MS) {
    await db.update(users).set({ restPush: null }).where(eq(users.id, userId));
    return null;
  }
  const id = crypto.randomUUID();
  await db.update(users).set({ restPush: { id, at } }).where(eq(users.id, userId));
  return id;
}

export async function disarmRestPush(userId: string) {
  await db.update(users).set({ restPush: null }).where(eq(users.id, userId));
}

/**
 * Waits for the rest to end and announces it — unless in the meantime the athlete ended or
 * changed the rest in the app (then this countdown is no longer the armed one).
 */
export async function fireRestPush(userId: string, id: string, at: number, next: string, url: string, origin: string) {
  // A moment of slack for a "next" tapped at the very last second.
  await sleep(Math.max(0, at - Date.now()) + 400);
  const [u] = await db.select({ restPush: users.restPush }).from(users).where(eq(users.id, userId));
  if (u?.restPush?.id !== id) return void (await notePush(userId, { event: "called off", tag: "rest" }));
  await db.update(users).set({ restPush: null }).where(eq(users.id, userId));
  await sendPush(userId, { title: "Відпочинок закінчився", body: next || "Час наступного підходу", tag: "rest", url }, origin);
}
