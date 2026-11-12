import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, gte, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { friendLinks, friendships, healthWorkouts, sets, users, workoutExercises, workouts } from "@/db/schema";
import { hashToken } from "./auth";
import { cardioKind } from "./cardio-kinds";
import { addDays, dayOf, weekStart } from "./format";
import { displayName, weekStreak, type BoardRow } from "./friends-logic";

const LINK_DAYS = 14;
const pair = (a: string, b: string) => (a < b ? { userA: a, userB: b } : { userA: b, userB: a });

// ───────────────────────── Connecting ─────────────────────────

export async function addFriendship(a: string, b: string) {
  if (a === b) return;
  await db.insert(friendships).values(pair(a, b)).onConflictDoNothing();
}

export async function removeFriendship(a: string, b: string) {
  const p = pair(a, b);
  await db.delete(friendships).where(and(eq(friendships.userA, p.userA), eq(friendships.userB, p.userB)));
}

export async function listFriends(userId: string) {
  const rows = await db
    .select({ a: friendships.userA, b: friendships.userB, since: friendships.createdAt })
    .from(friendships)
    .where(or(eq(friendships.userA, userId), eq(friendships.userB, userId)));
  const ids = rows.map((r) => (r.a === userId ? r.b : r.a));
  if (ids.length === 0) return [];
  const people = await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, ids));
  return people.map((p) => ({ id: p.id, name: displayName(p.username) })).sort((x, y) => x.name.localeCompare(y.name));
}

/** Creates (or replaces) the user's shareable friend link and returns its token. */
export async function createFriendLink(userId: string) {
  const token = `frd_${randomBytes(18).toString("base64url")}`;
  const values = { tokenHash: hashToken(token), userId, expiresAt: new Date(Date.now() + LINK_DAYS * 86400000), createdAt: new Date() };
  await db.insert(friendLinks).values(values).onConflictDoUpdate({ target: friendLinks.userId, set: values });
  return token;
}

export async function getFriendLinkInfo(userId: string) {
  const [row] = await db
    .select({ expiresAt: friendLinks.expiresAt })
    .from(friendLinks)
    .where(and(eq(friendLinks.userId, userId), gt(friendLinks.expiresAt, new Date())));
  return row ?? null;
}

export async function revokeFriendLink(userId: string) {
  await db.delete(friendLinks).where(eq(friendLinks.userId, userId));
}

/** Who a friend link belongs to, if it is still valid. */
export async function findFriendLink(token: string) {
  if (!token.startsWith("frd_")) return null;
  const [row] = await db
    .select({ userId: friendLinks.userId, username: users.username })
    .from(friendLinks)
    .innerJoin(users, eq(users.id, friendLinks.userId))
    .where(and(eq(friendLinks.tokenHash, hashToken(token)), gt(friendLinks.expiresAt, new Date())));
  return row ? { userId: row.userId, name: displayName(row.username) } : null;
}

// ───────────────────────── Competing ─────────────────────────

export type BoardPeriod = "week" | "month" | "all";

function periodStart(period: BoardPeriod, today: string): string | null {
  if (period === "week") return weekStart(today);
  if (period === "month") return `${today.slice(0, 7)}-01`;
  return null;
}

/** Training totals for the user and their friends over a period. Only aggregates leave an account. */
export async function getLeaderboard(userId: string, period: BoardPeriod): Promise<BoardRow[]> {
  const friends = await listFriends(userId);
  const [me] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId));
  const members = [{ id: userId, name: displayName(me?.username ?? "я") }, ...friends];
  const ids = members.map((m) => m.id);
  const today = dayOf();
  const start = periodStart(period, today);
  // Day boundaries are in the app's time zone; a small margin keeps the query simple.
  const since = start ? new Date(`${addDays(start, -1)}T12:00:00Z`) : null;
  const inPeriod = (d: Date) => !start || dayOf(d) >= start;

  const [sessions, setRows, cardio] = await Promise.all([
    db
      .select({ userId: workouts.userId, startedAt: workouts.startedAt, endedAt: workouts.endedAt, pausedSec: workouts.pausedSec })
      .from(workouts)
      .where(and(inArray(workouts.userId, ids), eq(workouts.status, "completed"))),
    db
      .select({
        userId: workouts.userId,
        startedAt: workouts.startedAt,
        n: sql<number>`count(*)::int`,
        volume: sql<number>`coalesce(sum(${sets.weight} * ${sets.reps}), 0)::float`,
      })
      .from(sets)
      .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
      .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
      .where(
        and(
          inArray(workouts.userId, ids),
          eq(workouts.status, "completed"),
          eq(sets.completed, true),
          ...(since ? [gte(workouts.startedAt, since)] : []),
        ),
      )
      .groupBy(workouts.userId, workouts.id, workouts.startedAt),
    db
      .select({ userId: healthWorkouts.userId, activityType: healthWorkouts.activityType, startAt: healthWorkouts.startAt, distanceM: healthWorkouts.distanceM })
      .from(healthWorkouts)
      .where(inArray(healthWorkouts.userId, ids)),
  ]);

  return members.map((m) => {
    const own = sessions.filter((s) => s.userId === m.id && s.startedAt);
    const done = own.filter((s) => inPeriod(s.startedAt!));
    const ownSets = setRows.filter((r) => r.userId === m.id && r.startedAt && inPeriod(r.startedAt));
    const ownCardio = cardio.filter((c) => c.userId === m.id && cardioKind(c.activityType));
    const days = [...own.map((s) => dayOf(s.startedAt!)), ...ownCardio.map((c) => dayOf(c.startAt))];
    return {
      userId: m.id,
      name: m.name,
      me: m.id === userId,
      workouts: done.length,
      activeMin: Math.round(
        done.reduce((a, s) => a + (s.endedAt ? Math.max(0, (s.endedAt.getTime() - s.startedAt!.getTime()) / 1000 - s.pausedSec) : 0), 0) / 60,
      ),
      volume: Math.round(ownSets.reduce((a, r) => a + r.volume, 0)),
      sets: ownSets.reduce((a, r) => a + r.n, 0),
      cardioKm: Math.round(ownCardio.filter((c) => inPeriod(c.startAt)).reduce((a, c) => a + (c.distanceM ?? 0), 0) / 100) / 10,
      streak: weekStreak(days, today),
    };
  });
}

/** Friends' latest finished workouts: who, what, when, how long, how much. */
export async function getFriendsFeed(userId: string, limit = 12) {
  const friends = await listFriends(userId);
  if (friends.length === 0) return [];
  const names = new Map(friends.map((f) => [f.id, f.name]));
  const rows = await db
    .select({
      id: workouts.id,
      userId: workouts.userId,
      name: workouts.name,
      startedAt: workouts.startedAt,
      endedAt: workouts.endedAt,
      pausedSec: workouts.pausedSec,
      sets: sql<number>`(select count(*)::int from sets s join workout_exercises we on we.id = s.workout_exercise_id where we.workout_id = "workouts"."id" and s.completed)`,
      volume: sql<number>`(select coalesce(sum(s.weight * s.reps), 0)::float from sets s join workout_exercises we on we.id = s.workout_exercise_id where we.workout_id = "workouts"."id" and s.completed)`,
    })
    .from(workouts)
    .where(and(inArray(workouts.userId, [...names.keys()]), eq(workouts.status, "completed"), lt(workouts.startedAt, new Date())))
    .orderBy(desc(workouts.startedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    who: names.get(r.userId) ?? "друг",
    name: r.name,
    startedAt: r.startedAt,
    activeSec: r.startedAt && r.endedAt ? Math.max(0, (r.endedAt.getTime() - r.startedAt.getTime()) / 1000 - r.pausedSec) : null,
    sets: r.sets,
    volume: Math.round(r.volume),
  }));
}
