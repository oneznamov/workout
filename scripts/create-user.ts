/**
 * Створює (або оновлює пароль) користувача.
 *   pnpm user:create <login>          — пароль буде запитано
 *   WORKOUT_PASSWORD=... pnpm user:create <login>
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

import { createInterface } from "node:readline/promises";
import bcrypt from "bcryptjs";
import postgres from "postgres";

async function main() {
  const username = process.argv[2]?.trim().toLowerCase();
  if (!username) throw new Error("Usage: pnpm user:create <login>");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

  let password = process.env.WORKOUT_PASSWORD;
  if (!password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question("Пароль (мін. 8 символів): ");
    rl.close();
  }
  if (!password || password.length < 8) throw new Error("Пароль має містити щонайменше 8 символів");

  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
  const hash = await bcrypt.hash(password, 12);
  await sql`
    insert into users (username, password_hash) values (${username}, ${hash})
    on conflict (username) do update set password_hash = excluded.password_hash`;
  await sql.end();
  console.log(`✓ Користувач «${username}» готовий`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
