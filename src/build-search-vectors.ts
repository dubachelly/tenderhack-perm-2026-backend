import "dotenv/config";
import { db, pool } from "./db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Building search_vector for СТЕ...");
  await db.execute(sql`
    UPDATE ste SET search_vector =
      setweight(to_tsvector('russian', coalesce(name, '')), 'A') ||
      setweight(to_tsvector('russian', coalesce(manufacturer, '')), 'B') ||
      setweight(to_tsvector('russian', coalesce(category, '')), 'C') ||
      setweight(to_tsvector('russian',
        coalesce(replace(replace(characteristics, ':', ' '), ';', ' '), '')
      ), 'D')
  `);
  console.log("Done!");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
