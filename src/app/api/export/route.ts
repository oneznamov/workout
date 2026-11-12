import { exportInsight, getExportInsight } from "@/lib/ai";
import { getUserId, tokenFromRequest, verifyApiToken } from "@/lib/auth";
import { exportAccount, exportSetsCsv } from "@/lib/export";
import { dayOf } from "@/lib/format";

export const maxDuration = 120;

/**
 * Download everything the account owns: `?format=csv` for a sets table, JSON otherwise.
 * `?ai=1` adds a fresh short analysis by the connected AI with the reasoning behind its plans
 * (without it the file carries the one written last time, if any). Works for the signed-in
 * user and with an access token.
 */
export async function GET(req: Request) {
  const userId = (await getUserId()) ?? (await verifyApiToken(tokenFromRequest(req)));
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const csv = params.get("format") === "csv";
  const name = `workout-${dayOf()}.${csv ? "csv" : "json"}`;
  let body: string;
  if (csv) body = `\uFEFF${await exportSetsCsv(userId)}`;
  else {
    // The export must not fail because the AI is not connected or did not answer.
    const insight = params.get("ai") === "1" ? await exportInsight(userId).catch(() => getExportInsight(userId)) : await getExportInsight(userId);
    body = JSON.stringify(await exportAccount(userId, insight), null, 1);
  }
  return new Response(body, {
    headers: {
      "Content-Type": csv ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
