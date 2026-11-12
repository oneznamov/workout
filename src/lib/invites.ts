import "server-only";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { invites, users, workouts } from "@/db/schema";
import { hashToken } from "./auth";
import { joinInviterTeam, pruneEmptyTeams } from "./team";

const INVITE_DAYS = 7;

export async function createInvite(adminId: string, note: string | null) {
  const token = `inv_${randomBytes(24).toString("base64url")}`;
  await db.insert(invites).values({
    tokenHash: hashToken(token),
    note: note?.trim() || null,
    createdBy: adminId,
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86400000),
  });
  return token;
}

export async function listInvites() {
  return db
    .select({
      id: invites.id,
      note: invites.note,
      createdAt: invites.createdAt,
      expiresAt: invites.expiresAt,
      usedAt: invites.usedAt,
      usedBy: users.username,
      open: sql<boolean>`${invites.usedAt} is null and ${invites.expiresAt} > now()`,
    })
    .from(invites)
    .leftJoin(users, eq(users.id, invites.usedBy))
    .orderBy(desc(invites.createdAt))
    .limit(50);
}

export async function revokeInvite(id: string) {
  await db.delete(invites).where(and(eq(invites.id, id), isNull(invites.usedAt)));
}

/** A link is valid once, until it expires. */
export async function findValidInvite(token: string) {
  if (!token.startsWith("inv_")) return null;
  const [row] = await db
    .select({ id: invites.id, note: invites.note, expiresAt: invites.expiresAt, inviter: users.username })
    .from(invites)
    .leftJoin(users, eq(users.id, invites.createdBy))
    .where(and(eq(invites.tokenHash, hashToken(token)), isNull(invites.usedAt), gt(invites.expiresAt, new Date())));
  return row ?? null;
}

export type AcceptResult = { userId: string } | { error: string };

export async function acceptInvite(token: string, username: string, password: string): Promise<AcceptResult> {
  const invite = await findValidInvite(token);
  if (!invite) return { error: "Запрошення недійсне або вже використане" };
  const [origin] = await db.select({ createdBy: invites.createdBy }).from(invites).where(eq(invites.id, invite.id));
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
  if (taken) return { error: "Такий логін уже зайнятий" };
  const passwordHash = await bcrypt.hash(password, 12);
  // Claim the invite first so two people cannot use the same link.
  const [claimed] = await db
    .update(invites)
    .set({ usedAt: new Date() })
    .where(and(eq(invites.id, invite.id), isNull(invites.usedAt)))
    .returning({ id: invites.id });
  if (!claimed) return { error: "Запрошення вже використане" };
  try {
    const [user] = await db.insert(users).values({ username, passwordHash }).returning({ id: users.id });
    await db.update(invites).set({ usedBy: user.id }).where(eq(invites.id, invite.id));
    // Whoever invited you takes you into their team — no second step needed.
    if (origin?.createdBy) await joinInviterTeam(origin.createdBy, user.id).catch(() => undefined);
    return { userId: user.id };
  } catch {
    await db.update(invites).set({ usedAt: null }).where(eq(invites.id, invite.id));
    return { error: "Не вдалося створити акаунт — спробуйте інший логін" };
  }
}

export async function listUsers() {
  return db
    .select({
      id: users.id,
      username: users.username,
      isAdmin: users.isAdmin,
      createdAt: users.createdAt,
      workouts: sql<number>`(select count(*)::int from ${workouts} w where w.user_id = "users"."id")`,
      lastWorkoutAt: sql<Date | null>`(select max(w.started_at) from ${workouts} w where w.user_id = "users"."id")`,
    })
    .from(users)
    .orderBy(users.createdAt);
}

/** Removes a user and everything they recorded. Admins cannot be removed this way. */
export async function deleteUser(id: string) {
  await db.delete(users).where(and(eq(users.id, id), eq(users.isAdmin, false)));
  await pruneEmptyTeams();
}
