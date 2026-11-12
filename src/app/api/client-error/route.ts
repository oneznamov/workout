import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { logError } from "@/lib/errors";

const schema = z.object({ message: z.string().max(1000), detail: z.string().max(6000).optional(), path: z.string().max(500).optional() });

/** Browser-side errors reported by the app itself (signed-in users only). */
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return new Response(null, { status: 204 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (parsed.success) await logError({ source: "client", ...parsed.data, userId });
  return new Response(null, { status: 204 });
}
