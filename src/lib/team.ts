import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { healthWorkouts, sets, teamInvites, teamMembers, teams, users, workoutExercises, workoutReactions, workouts } from "@/db/schema";
import { hashToken } from "./auth";
import { cardioKind } from "./cardio-kinds";
import { addDays, dayOf, weekStart } from "./format";
import { normalizeProfile, sickWeeks } from "./profile";
import { displayName, normalizeChallenge, REACTIONS, weekStreak, type BoardRow } from "./team-logic";

const LINK_DAYS = 14;
export const TEAM_MAX = 20;

/** An error whose message is meant for the person using the app. */
export class TeamError extends Error {}

// ───────────────────────── Membership ─────────────────────────

async function teamIdOf(userId: string): Promise<string | null> {
  const [m] = await db.select({ teamId: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, userId));
  return m?.teamId ?? null;
}

/** Members in the order they joined — the first one is the captain. */
async function membersOf(teamId: string) {
  const rows = await db
    .select({ id: users.id, username: users.username })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, teamId))
    .orderBy(asc(teamMembers.joinedAt), asc(teamMembers.id));
  return rows.map((r) => ({ id: r.id, name: displayName(r.username) }));
}

/** The user plus their teammates; just the user when they have no team. */
async function teamPeople(userId: string) {
  const teamId = await teamIdOf(userId);
  if (teamId) return membersOf(teamId);
  const [me] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId));
  return [{ id: userId, name: displayName(me?.username ?? "я") }];
}

/** Teams nobody is in any more (everyone left, or the last member's account was removed). */
export async function pruneEmptyTeams() {
  await db.execute(sql`delete from teams t where not exists (select 1 from team_members m where m.team_id = t.id)`);
}

/** The user's team id, creating a team of one (named after them) when they have none. */
async function ensureTeam(userId: string): Promise<string> {
  const existing = await teamIdOf(userId);
  if (existing) return existing;
  const [u] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId));
  return db.transaction(async (tx) => {
    const [t] = await tx.insert(teams).values({ name: `Команда ${displayName(u?.username ?? "")}`.trim() }).returning({ id: teams.id });
    await tx.insert(teamMembers).values({ teamId: t.id, userId });
    return t.id;
  });
}

/** Moves the user into a team (leaving the one they were in) and clears the invitation that led there. */
async function joinTeam(userId: string, teamId: string) {
  if ((await teamIdOf(userId)) === teamId) return;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(teamMembers).where(eq(teamMembers.teamId, teamId));
  if (n >= TEAM_MAX) throw new TeamError(`У команді вже ${TEAM_MAX} учасників — більше не вміщується.`);
  await db.transaction(async (tx) => {
    await tx.delete(teamMembers).where(eq(teamMembers.userId, userId));
    await tx.insert(teamMembers).values({ teamId, userId });
    await tx.delete(teamInvites).where(and(eq(teamInvites.userId, userId), eq(teamInvites.teamId, teamId)));
  });
  await pruneEmptyTeams();
}

export async function getMyTeam(userId: string) {
  const teamId = await teamIdOf(userId);
  if (!teamId) return null;
  const [[team], members, pending] = await Promise.all([
    db.select().from(teams).where(eq(teams.id, teamId)),
    membersOf(teamId),
    db
      .select({ id: users.id, username: users.username })
      .from(teamInvites)
      .innerJoin(users, eq(users.id, teamInvites.userId))
      .where(eq(teamInvites.teamId, teamId))
      .orderBy(asc(teamInvites.createdAt)),
  ]);
  const captainId = members[0]?.id ?? userId;
  return {
    id: teamId,
    name: team.name,
    isCaptain: captainId === userId,
    members: members.map((m) => ({ ...m, captain: m.id === captainId, me: m.id === userId })),
    pending: pending.map((p) => ({ id: p.id, name: displayName(p.username) })),
    linkUntil: team.linkHash && team.linkExpiresAt && team.linkExpiresAt > new Date() ? team.linkExpiresAt : null,
    challenge: normalizeChallenge(team.challenge),
  };
}

/** Everyone else in the app and how they relate to the user's team. Names only — nothing about their training. */
export async function listPeople(userId: string) {
  const mine = await teamIdOf(userId);
  const [rows, invited, invitedMe] = await Promise.all([
    db
      .select({ id: users.id, username: users.username, teamId: teamMembers.teamId, teamName: teams.name })
      .from(users)
      .leftJoin(teamMembers, eq(teamMembers.userId, users.id))
      .leftJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(ne(users.id, userId)),
    mine ? db.select({ userId: teamInvites.userId }).from(teamInvites).where(eq(teamInvites.teamId, mine)) : [],
    db.select({ teamId: teamInvites.teamId }).from(teamInvites).where(eq(teamInvites.userId, userId)),
  ]);
  const waiting = new Set(invited.map((i) => i.userId));
  const callingMe = new Set(invitedMe.map((i) => i.teamId));
  return rows
    .map((r) => ({
      id: r.id,
      name: displayName(r.username),
      status: (mine && r.teamId === mine ? "member" : waiting.has(r.id) ? "invited" : "free") as "member" | "invited" | "free",
      otherTeam: r.teamId && r.teamId !== mine ? r.teamName : null,
      /** Their team has already invited the user — answering that is simpler than inviting back. */
      invitesMe: Boolean(r.teamId && callingMe.has(r.teamId)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ───────────────────────── Invitations inside the app ─────────────────────────

/** Invites another user of the app into the user's team; the team is created on the first invitation. */
export async function inviteToTeam(userId: string, targetId: string) {
  if (userId === targetId) return;
  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, targetId));
  if (!target) throw new TeamError("Такого користувача немає.");
  const teamId = await ensureTeam(userId);
  if ((await teamIdOf(targetId)) === teamId) return;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(teamMembers).where(eq(teamMembers.teamId, teamId));
  if (n >= TEAM_MAX) throw new TeamError(`У команді вже ${TEAM_MAX} учасників — більше не вміщується.`);
  await db.insert(teamInvites).values({ teamId, userId: targetId, invitedBy: userId }).onConflictDoNothing();
}

export async function cancelTeamInvite(userId: string, targetId: string) {
  const teamId = await teamIdOf(userId);
  if (teamId) await db.delete(teamInvites).where(and(eq(teamInvites.teamId, teamId), eq(teamInvites.userId, targetId)));
}

/** Invitations waiting for the user's answer. */
export async function listMyTeamInvites(userId: string) {
  const rows = await db
    .select({ id: teamInvites.id, teamId: teamInvites.teamId, teamName: teams.name, by: users.username })
    .from(teamInvites)
    .innerJoin(teams, eq(teams.id, teamInvites.teamId))
    .innerJoin(users, eq(users.id, teamInvites.invitedBy))
    .where(eq(teamInvites.userId, userId))
    .orderBy(desc(teamInvites.createdAt));
  return Promise.all(
    rows.map(async (r) => ({ id: r.id, teamName: r.teamName, by: displayName(r.by), members: (await membersOf(r.teamId)).map((m) => m.name) })),
  );
}

export async function countMyTeamInvites(userId: string) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(teamInvites).where(eq(teamInvites.userId, userId));
  return n;
}

export async function respondTeamInvite(userId: string, inviteId: string, accept: boolean) {
  const [invite] = await db
    .select({ id: teamInvites.id, teamId: teamInvites.teamId })
    .from(teamInvites)
    .where(and(eq(teamInvites.id, inviteId), eq(teamInvites.userId, userId)));
  if (!invite) return;
  if (accept) await joinTeam(userId, invite.teamId);
  await db.delete(teamInvites).where(eq(teamInvites.id, invite.id));
}

/** A person who registered through someone's invitation joins that person's team straight away. */
export async function joinInviterTeam(inviterId: string, newUserId: string) {
  await joinTeam(newUserId, await ensureTeam(inviterId));
}

// ───────────────────────── Managing the team ─────────────────────────

export async function leaveTeam(userId: string) {
  await db.delete(teamMembers).where(eq(teamMembers.userId, userId));
  await pruneEmptyTeams();
}

export async function removeFromTeam(userId: string, targetId: string) {
  const team = await getMyTeam(userId);
  if (!team?.isCaptain) throw new TeamError("Прибирати учасників може лише капітан.");
  if (targetId === userId) return;
  await db.delete(teamMembers).where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, targetId)));
}

export async function renameTeam(userId: string, name: string) {
  const team = await getMyTeam(userId);
  if (!team?.isCaptain) throw new TeamError("Перейменувати команду може лише капітан.");
  const clean = name.trim().slice(0, 40);
  if (clean.length < 2) throw new TeamError("Назва надто коротка.");
  await db.update(teams).set({ name: clean }).where(eq(teams.id, team.id));
}

// ───────────────────────── Join link ─────────────────────────

/** Creates (or replaces) the team's shareable join link and returns its token. */
export async function createTeamLink(userId: string) {
  const teamId = await ensureTeam(userId);
  const token = `team_${randomBytes(18).toString("base64url")}`;
  await db
    .update(teams)
    .set({ linkHash: hashToken(token), linkExpiresAt: new Date(Date.now() + LINK_DAYS * 86400000) })
    .where(eq(teams.id, teamId));
  return token;
}

export async function revokeTeamLink(userId: string) {
  const teamId = await teamIdOf(userId);
  if (teamId) await db.update(teams).set({ linkHash: null, linkExpiresAt: null }).where(eq(teams.id, teamId));
}

/** The team a join link leads to, if the link is still valid. */
export async function findTeamLink(token: string) {
  if (!token.startsWith("team_")) return null;
  const [team] = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(and(eq(teams.linkHash, hashToken(token)), gt(teams.linkExpiresAt, new Date())));
  return team ? { ...team, members: await membersOf(team.id) } : null;
}

export async function joinTeamByLink(userId: string, token: string) {
  const team = await findTeamLink(token);
  if (!team) throw new TeamError("Посилання вже не працює.");
  await joinTeam(userId, team.id);
}

// ───────────────────────── Competing ─────────────────────────

export type BoardPeriod = "week" | "month" | "all";

function periodStart(period: BoardPeriod, today: string): string | null {
  if (period === "week") return weekStart(today);
  if (period === "month") return `${today.slice(0, 7)}-01`;
  return null;
}

/** Training totals for everyone in the user's team over a period. Only aggregates leave an account. */
export async function getLeaderboard(userId: string, period: BoardPeriod): Promise<BoardRow[]> {
  const members = await teamPeople(userId);
  const ids = members.map((m) => m.id);
  const today = dayOf();
  // Weeks someone spent ill do not break their streak.
  const profiles = await db.select({ id: users.id, profile: users.profile }).from(users).where(inArray(users.id, ids));
  const paused = new Map(profiles.map((p) => [p.id, sickWeeks(normalizeProfile(p.profile), today)]));
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
      streak: weekStreak(days, today, paused.get(m.id)),
    };
  });
}

/** The team's latest finished workouts — everyone's, the user's own included — with the reactions each one got. */
export async function getTeamFeed(userId: string, limit = 14) {
  const people = await teamPeople(userId);
  if (people.length < 2) return [];
  const names = new Map(people.map((f) => [f.id, f.name]));
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
  const reactions = rows.length
    ? await db
        .select({ workoutId: workoutReactions.workoutId, userId: workoutReactions.userId, emoji: workoutReactions.emoji })
        .from(workoutReactions)
        .where(
          inArray(
            workoutReactions.workoutId,
            rows.map((r) => r.id),
          ),
        )
    : [];
  return rows.map((r) => {
    const got = reactions.filter((x) => x.workoutId === r.id);
    return {
      id: r.id,
      who: names.get(r.userId) ?? "учасник",
      own: r.userId === userId,
      name: r.name,
      startedAt: r.startedAt,
      activeSec: r.startedAt && r.endedAt ? Math.max(0, (r.endedAt.getTime() - r.startedAt.getTime()) / 1000 - r.pausedSec) : null,
      sets: r.sets,
      volume: Math.round(r.volume),
      reactions: REACTIONS.map((emoji) => ({ emoji, count: got.filter((x) => x.emoji === emoji).length })).filter((x) => x.count > 0),
      mine: got.find((x) => x.userId === userId)?.emoji ?? null,
    };
  });
}

/** Leaves (or with `null` removes) the user's reaction to a teammate's finished workout. */
export async function reactToWorkout(userId: string, workoutId: string, emoji: string | null) {
  const [w] = await db.select({ owner: workouts.userId }).from(workouts).where(and(eq(workouts.id, workoutId), eq(workouts.status, "completed")));
  if (!w || w.owner === userId) return;
  if (!(await teamPeople(userId)).some((p) => p.id === w.owner)) throw new TeamError("Реагувати можна лише на тренування своєї команди.");
  if (!emoji) {
    await db.delete(workoutReactions).where(and(eq(workoutReactions.workoutId, workoutId), eq(workoutReactions.userId, userId)));
    return;
  }
  if (!(REACTIONS as readonly string[]).includes(emoji)) return;
  await db
    .insert(workoutReactions)
    .values({ workoutId, userId, emoji })
    .onConflictDoUpdate({ target: [workoutReactions.workoutId, workoutReactions.userId], set: { emoji, createdAt: new Date() } });
}

/** Sets or clears the team's weekly challenge. Captain only. */
export async function setTeamChallenge(userId: string, input: unknown) {
  const team = await getMyTeam(userId);
  if (!team?.isCaptain) throw new TeamError("Виклик тижня задає капітан.");
  await db.update(teams).set({ challenge: input == null ? null : normalizeChallenge(input) }).where(eq(teams.id, team.id));
}
