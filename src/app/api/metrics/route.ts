import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { upsertMetric } from "@/lib/health";

const schema = z.object({
  entries: z
    .array(
      z.object({
        metric: z.enum(["body_mass", "body_fat_percentage", "lean_body_mass"]),
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        value: z.number().positive().max(1000),
      }),
    )
    .max(200),
});

/** Manual body measurements, including ones queued on the device while offline. */
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  for (const e of parsed.data.entries) await upsertMetric(userId, e.metric, e.day, e.value, "manual");
  return Response.json({ ok: true });
}
