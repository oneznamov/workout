import { connection } from "next/server";

/** Cheap reachability check for the connection badge; also says which build the server runs. */
export async function GET() {
  await connection();
  return Response.json({ build: process.env.NEXT_PUBLIC_BUILD_ID ?? null }, { headers: { "Cache-Control": "no-store" } });
}
