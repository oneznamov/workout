import { getUserId } from "@/lib/auth";
import { exportAccount, exportSetsCsv } from "@/lib/export";
import { dayOf } from "@/lib/format";

export const maxDuration = 60;

/** Download everything the signed-in account owns: `?format=csv` for a sets table, JSON otherwise. */
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const csv = new URL(req.url).searchParams.get("format") === "csv";
  const name = `workout-${dayOf()}.${csv ? "csv" : "json"}`;
  const body = csv ? `﻿${await exportSetsCsv(userId)}` : JSON.stringify(await exportAccount(userId), null, 1);
  return new Response(body, {
    headers: {
      "Content-Type": csv ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
