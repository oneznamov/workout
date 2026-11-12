import "server-only";
import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { loginAttempts } from "@/db/schema";

/** Failed sign-ins allowed inside the window before further attempts are refused. */
export const LOGIN_WINDOW_MIN = 15;
export const MAX_FAILS_PER_LOGIN = 8;
export const MAX_FAILS_PER_IP = 30;

export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

const keys = (username: string, ip: string) => ({ user: `u:${username}`, ip: `ip:${ip}` });

/** Seconds until another attempt is allowed; 0 when sign-in may proceed. */
export async function loginBlockedFor(username: string, ip: string): Promise<number> {
  const k = keys(username, ip);
  const since = new Date(Date.now() - LOGIN_WINDOW_MIN * 60000);
  const rows = await db
    .select({ key: loginAttempts.key, n: sql<number>`count(*)::int`, oldest: sql<Date>`min(${loginAttempts.createdAt})` })
    .from(loginAttempts)
    .where(and(inArray(loginAttempts.key, [k.user, k.ip]), gt(loginAttempts.createdAt, since)))
    .groupBy(loginAttempts.key);
  let wait = 0;
  for (const r of rows) {
    const limit = r.key === k.user ? MAX_FAILS_PER_LOGIN : MAX_FAILS_PER_IP;
    if (r.n >= limit) {
      const until = new Date(r.oldest).getTime() + LOGIN_WINDOW_MIN * 60000;
      wait = Math.max(wait, Math.ceil((until - Date.now()) / 1000));
    }
  }
  return Math.max(0, wait);
}

export async function recordFailedLogin(username: string, ip: string) {
  const k = keys(username, ip);
  await db.insert(loginAttempts).values([{ key: k.user }, { key: k.ip }]);
  // Housekeeping: nothing older than a day is needed.
  await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, new Date(Date.now() - 86400000)));
}

export async function clearFailedLogins(username: string) {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, `u:${username}`));
}
