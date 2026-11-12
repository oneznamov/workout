import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getUserId } from "@/lib/auth";

/** An account's photo. Its address carries the time it was saved, so it can be cached for good. */
export async function GET(_req: Request, ctx: RouteContext<"/api/avatar/[id]">) {
  if (!(await getUserId())) return new Response(null, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const [u] = await db.select({ avatar: users.avatar }).from(users).where(eq(users.id, id));
  const m = u?.avatar?.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return new Response(null, { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
