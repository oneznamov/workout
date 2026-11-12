/** Заповнює/оновлює вбудовану бібліотеку вправ. Безпечно запускати повторно. */
import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

import postgres from "postgres";
import { DEFAULT_EXERCISES } from "../src/db/exercise-data";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
  for (const e of DEFAULT_EXERCISES) {
    await sql`
      insert into exercises (slug, name, name_uk, muscle, secondary_muscles, equipment, tracking)
      values (${e.slug}, ${e.name}, ${e.nameUk}, ${e.muscle}, ${sql.json(e.secondaryMuscles)}, ${e.equipment}, ${e.tracking})
      on conflict (slug) do update set
        name = excluded.name, name_uk = excluded.name_uk, muscle = excluded.muscle,
        secondary_muscles = excluded.secondary_muscles, equipment = excluded.equipment,
        tracking = excluded.tracking`;
  }
  await sql.end();
  console.log(`✓ Вправ у бібліотеці: ${DEFAULT_EXERCISES.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
