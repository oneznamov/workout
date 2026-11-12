import { tokenFromRequest, verifyApiToken } from "@/lib/auth";
import { ingestHealth } from "@/lib/health";

export const maxDuration = 60;

/**
 * Apple Health ingest endpoint.
 *
 *   POST /api/health   Authorization: Bearer wk_…   (or ?key=wk_…)
 *
 * Body: the "Health Auto Export" REST payload ({ data: { metrics, workouts } }),
 * or a flat { metrics: [{ name, date, qty, units }], workouts: [{ name, start, end, … }] }.
 */
export async function POST(req: Request) {
  const userId = await verifyApiToken(tokenFromRequest(req));
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const result = await ingestHealth(userId, body);
  return Response.json({ ok: true, ...result });
}
