import "server-only";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { passwordResets, users } from "@/db/schema";
import { bumpSessionVersion, hashToken } from "./auth";

const RESET_HOURS = 24;

/** Creates a one-time link token for setting a new password. Earlier unused links stop working. */
export async function createPasswordReset(userId: string) {
  await db.delete(passwordResets).where(and(eq(passwordResets.userId, userId), isNull(passwordResets.usedAt)));
  const token = `rst_${randomBytes(24).toString("base64url")}`;
  await db.insert(passwordResets).values({ tokenHash: hashToken(token), userId, expiresAt: new Date(Date.now() + RESET_HOURS * 3600000) });
  return token;
}

export async function findValidReset(token: string) {
  if (!token.startsWith("rst_")) return null;
  const [row] = await db
    .select({ id: passwordResets.id, userId: passwordResets.userId, username: users.username })
    .from(passwordResets)
    .innerJoin(users, eq(users.id, passwordResets.userId))
    .where(and(eq(passwordResets.tokenHash, hashToken(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())));
  return row ?? null;
}

/** Sets the new password, signs the account out everywhere and returns what a fresh session needs. */
export async function completePasswordReset(token: string, password: string) {
  const reset = await findValidReset(token);
  if (!reset) return null;
  const [claimed] = await db
    .update(passwordResets)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResets.id, reset.id), isNull(passwordResets.usedAt)))
    .returning({ id: passwordResets.id });
  if (!claimed) return null;
  await db.update(users).set({ passwordHash: await bcrypt.hash(password, 12) }).where(eq(users.id, reset.userId));
  const sessionVersion = await bumpSessionVersion(reset.userId);
  return { userId: reset.userId, sessionVersion };
}
