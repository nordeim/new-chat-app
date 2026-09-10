// Seed CLI: idempotent local-dev seed for a fresh database.
//   npm run db:seed
// Safe to re-run; never overwrites existing workspaces.
// Reads DATABASE_URL from the environment or .env.
import "dotenv/config";

const { seed } = await import("../src/db/seed.ts");
const { db, pool } = await import("../src/db/index.ts");
const { sessions, conversations } = await import("../src/db/schema.ts");

try {
  const { inserted } = await seed(db, { sessions, conversations });
  console.log(
    JSON.stringify({
      operation: "db.seed",
      inserted,
    }),
  );
} finally {
  await pool.end();
}
