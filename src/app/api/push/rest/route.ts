import { after } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { armRestPush, disarmRestPush, fireRestPush } from "@/lib/push";

/** The request stays alive in the background until the rest ends, then sends the push. */
export const maxDuration = 300;

const body = z.union([
  z.object({ cancel: z.literal(true) }),
  z.object({ endsAt: z.number().int().positive(), next: z.string().max(200).default(""), path: z.string().max(200).default("/") }),
]);

/**
 * Called by the app whenever a rest countdown starts or changes: `{ endsAt, next, path }` arms
 * a "rest is over" notification for that moment, `{ cancel: true }` calls it off (the athlete
 * moved on, or the app was on screen when the rest ended and has already made its sound).
 */
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  if ("cancel" in parsed.data) {
    await disarmRestPush(userId);
    return Response.json({ ok: true });
  }
  const { endsAt, next, path } = parsed.data;
  const id = await armRestPush(userId, endsAt);
  if (id) {
    const origin = new URL(req.url).origin;
    const url = /^\/[\w\-./]*$/.test(path) ? path : "/";
    after(() => fireRestPush(userId, id, endsAt, next, url, origin));
  }
  return Response.json({ ok: true, armed: Boolean(id) });
}
