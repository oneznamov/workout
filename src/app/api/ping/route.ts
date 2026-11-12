import { connection } from "next/server";

/** Cheap reachability check for the connection badge. */
export async function GET() {
  await connection();
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
