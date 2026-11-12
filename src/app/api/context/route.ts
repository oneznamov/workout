import { getAthleteContext } from "@/lib/athlete-context";
import { tokenFromRequest, verifyApiToken } from "@/lib/auth";

/**
 * Everything the app knows about the athlete, as one JSON document — the same one the
 * built-in AI coach and the Claude tool `get_athlete_context` read.
 *
 *   GET /api/context   Authorization: Bearer wk_…   (or ?key=wk_…)
 */
export async function GET(req: Request) {
  const userId = await verifyApiToken(tokenFromRequest(req));
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await getAthleteContext(userId, { history: 20 }), { headers: { "Cache-Control": "no-store" } });
}
