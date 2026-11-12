import { getUserId } from "@/lib/auth";
import { toClientWorkout } from "@/lib/shape";
import { getWorkout, NotFoundError } from "@/lib/workouts";

/** Polled by the live workout screen so edits made by Claude show up mid-session. */
export async function GET(_req: Request, ctx: RouteContext<"/api/workouts/[id]">) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    return Response.json(toClientWorkout(await getWorkout(userId, id)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof NotFoundError) return Response.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}
