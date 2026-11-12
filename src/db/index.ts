import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // prepare:false keeps us compatible with pooled (pgbouncer) connections such as Neon's.
  globalForDb.pg ??= postgres(url, { max: 5, prepare: false, idle_timeout: 20 });
  return globalForDb.pg;
}

let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

/** Lazy so that `next build` does not need a database. */
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_t, prop) {
    _db ??= drizzle(client(), { schema });
    const v = Reflect.get(_db, prop);
    return typeof v === "function" ? v.bind(_db) : v;
  },
});

export { schema };
