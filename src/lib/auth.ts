import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens, users } from "@/db/schema";

export const SESSION_COOKIE = "session";
const SESSION_DAYS = 365;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set (32+ chars)");
  return new TextEncoder().encode(s);
}

/** Signs the device in. `sessionVersion` ties the cookie to the account's current "generation". */
export async function createSession(userId: string, sessionVersion = 0) {
  const token = await new SignJWT({ sub: userId, sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

async function readSession(): Promise<{ userId: string; version: number } | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    return { userId: payload.sub, version: typeof payload.sv === "number" ? payload.sv : 0 };
  } catch {
    return null;
  }
}

/**
 * The signed-in user, verified against the database. A session stops working when the
 * account is deleted or its session version was bumped (password change/reset, "sign out everywhere").
 */
export const getSessionUser = cache(async () => {
  const session = await readSession();
  if (!session) return null;
  const [u] = await db
    .select({
      id: users.id,
      username: users.username,
      goals: users.goals,
      dashboard: users.dashboard,
      profile: users.profile,
      isAdmin: users.isAdmin,
      sessionVersion: users.sessionVersion,
    })
    .from(users)
    .where(eq(users.id, session.userId));
  return u && u.sessionVersion === session.version ? u : null;
});

/** Returns the signed-in user id, or null. Deduplicated per request. */
export const getUserId = cache(async (): Promise<string | null> => (await getSessionUser())?.id ?? null);

export async function requireUserId(): Promise<string> {
  const id = await getUserId();
  if (!id) redirect("/login");
  return id;
}

export const getUser = cache(async () => {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  return u;
});

/** Invalidates every existing session of the account and returns the new version. */
export async function bumpSessionVersion(userId: string) {
  const [row] = await db
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, userId))
    .returning({ v: users.sessionVersion });
  return row?.v ?? 0;
}

// ---- API tokens (Claude MCP + Apple Health export) ----

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateApiToken() {
  const token = `wk_${randomBytes(24).toString("base64url")}`;
  return { token, hash: hashToken(token), prefix: token.slice(0, 7) };
}

/** Resolves a bearer token to a user id (and stamps last use). */
export async function verifyApiToken(token: string | null | undefined): Promise<string | null> {
  if (!token || !token.startsWith("wk_")) return null;
  const [row] = await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.tokenHash, hashToken(token)))
    .returning({ userId: apiTokens.userId });
  return row?.userId ?? null;
}

export function tokenFromRequest(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (h?.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  const url = new URL(req.url);
  return url.searchParams.get("key") ?? req.headers.get("x-api-key");
}

/** For admin-only pages and actions: the signed-in admin, or null. */
export async function getAdmin() {
  const u = await getSessionUser();
  return u?.isAdmin ? u : null;
}
