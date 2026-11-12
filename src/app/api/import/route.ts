import { getUserId } from "@/lib/auth";
import { importData } from "@/lib/import-data";
import { importSchema } from "@/lib/import-schema";

export const maxDuration = 120;

/** Brings a data export (the JSON from /api/export) into the signed-in account. Adds, never overwrites. */
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = importSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid", issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
  try {
    return Response.json({ ok: true, result: await importData(userId, parsed.data) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[import]", e);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
