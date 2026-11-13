import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { disabled, featureOn } from "@/lib/config";
import { isPushEndpoint, pushPublicKey, removePushSubscription, savePushSubscription } from "@/lib/push";

const subscription = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(300), auth: z.string().max(300) }) });

/** The public key a browser needs to subscribe to this app's notifications. */
export async function GET() {
  if (!featureOn("push")) return disabled();
  if (!(await getUserId())) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ key: await pushPublicKey() });
}

/** Registers this device for notifications. */
export async function POST(req: Request) {
  if (!featureOn("push")) return disabled();
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = subscription.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isPushEndpoint(parsed.data.endpoint)) return Response.json({ error: "invalid" }, { status: 400 });
  await savePushSubscription(userId, parsed.data);
  return Response.json({ ok: true });
}

/** Forgets this device. */
export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint === "string") await removePushSubscription(userId, body.endpoint);
  return Response.json({ ok: true });
}
