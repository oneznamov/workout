import "server-only";
import { desc, lt } from "drizzle-orm";
import { db } from "@/db";
import { errorLog } from "@/db/schema";

const clip = (s: string | null | undefined, n: number) => (s ? s.slice(0, n) : null);

/** Records an error for the admin's error list. Never throws — logging must not break the request. */
export async function logError(entry: { source: "server" | "client"; message: string; detail?: string | null; path?: string | null; userId?: string | null }) {
  try {
    await db.insert(errorLog).values({
      source: entry.source,
      message: clip(entry.message, 500) ?? "Unknown error",
      detail: clip(entry.detail, 4000),
      path: clip(entry.path, 300),
      userId: entry.userId ?? null,
    });
    // Keep a month of history.
    await db.delete(errorLog).where(lt(errorLog.createdAt, new Date(Date.now() - 30 * 86400000)));
  } catch (e) {
    console.error("logError failed", e);
  }
}

export async function recentErrors(limit = 50) {
  return db.select().from(errorLog).orderBy(desc(errorLog.createdAt)).limit(limit);
}
