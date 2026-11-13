import { createMcpHandler } from "mcp-handler";
import { tokenFromRequest, verifyApiToken } from "@/lib/auth";
import { disabled, featureOn } from "@/lib/config";
import { TZ } from "@/lib/format";
import { registerWorkoutTools } from "@/lib/mcp-tools";

export const maxDuration = 60;

/**
 * MCP server for Claude: plan, edit and analyse workouts.
 * Auth: `Authorization: Bearer wk_…` header, or `?key=wk_…` for clients that only accept a URL.
 */
async function handler(req: Request) {
  if (!featureOn("mcp")) return disabled();
  const userId = await verifyApiToken(tokenFromRequest(req));
  if (!userId) {
    return Response.json(
      { error: "unauthorized", message: "Pass an API token from Settings as a Bearer token or ?key= parameter." },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="workout"' } },
    );
  }
  const mcp = createMcpHandler((server) => registerWorkoutTools(server, userId), {
    serverInfo: { name: "workout", version: "1.0.0" },
    instructions:
      `Gym training log of one user. Weights are in kg, dates are YYYY-MM-DD in the user's time zone (${TZ}). ` +
      "Before planning, look at recent history (list_workouts, get_exercise_history, get_training_analytics) and resolve exercises with list_exercises. " +
      "Planned workouts appear in the user's app immediately; edits to an in-progress workout show up within ~15 seconds.",
  });
  return mcp(req);
}

export { handler as GET, handler as POST, handler as DELETE };
