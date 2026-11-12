import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens, users } from "@/db/schema";

export const SESSION_COOKIE = "session";
const SESSION_DAYS = 365;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set (32+ chars)");
  return new TextEncoder().encode(s);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
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

/** Returns the signed-in user id, or null. Deduplicated per request. */
export const getUserId = cache(async (): Promise<string | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
});

export async function requireUserId(): Promise<string> {
  const id = await getUserId();
  if (!id) redirect("/login");
  return id;
}

/** The signed-in user, verified against the database (a session of a deleted user counts as signed out). */
export const getSessionUser = cache(async () => {
  const id = await getUserId();
  if (!id) return null;
  const [u] = await db.select({ id: users.id, username: users.username, goals: users.goals }).from(users).where(eq(users.id, id));
  return u ?? null;
});

export const getUser = cache(async () => {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  return u;
});

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
