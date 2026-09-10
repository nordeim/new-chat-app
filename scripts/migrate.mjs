// Migrate CLI wrapper: runs drizzle-kit migrate, then logs observable summary.
//   npm run db:migrate
// Adds preflight (DATABASE_URL + DB reachable) with curated JSON errors and
// post-migrate summary (hash + row counts) so fast no-ops are self-explanatory.
// Does not change migration semantics — drizzle-kit remains the source of truth.
import "dotenv/config";
import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error(
    JSON.stringify({
      operation: "db.migrate",
      error: "DATABASE_URL is required — set it in .env or the environment.",
    }),
  );
  process.exit(2);
}

// Preflight: DB reachable (curated vs raw ECONNREFUSED)
const { pool } = await import("../src/db/index.ts");
try {
  await pool.query("select 1");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({
      operation: "db.migrate",
      error:
        "PostgreSQL not reachable at DATABASE_URL — run docker compose up -d and check DATABASE_URL.",
      detail: message,
    }),
  );
  await pool.end();
  process.exit(1);
}

// Run the real migrator (inherit stdio so spinner + [✓] remain visible)
const result = spawnSync("npx", ["drizzle-kit", "migrate"], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(
    JSON.stringify({
      operation: "db.migrate",
      error: result.error.message,
    }),
  );
  await pool.end();
  process.exit(1);
}

if (result.status !== 0 && result.status !== null) {
  await pool.end();
  process.exit(result.status);
}

// Post-migrate summary: hash + counts (makes idempotency observable)
let hash = null;
let sessions = null;
let conversations = null;
try {
  const h = await pool.query(
    "SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1",
  );
  hash = h.rows[0]?.hash ?? null;
} catch {
  // drizzle table may not exist if migrate failed — non-fatal.
}
try {
  const s = await pool.query("SELECT count(*)::int AS count FROM chat_sessions");
  sessions = s.rows[0]?.count ?? null;
} catch {}
try {
  const c = await pool.query("SELECT count(*)::int AS count FROM conversations");
  conversations = c.rows[0]?.count ?? null;
} catch {}

console.log(
  JSON.stringify({
    operation: "db.migrate",
    hash,
    sessions,
    conversations,
    // Single source of truth remains drizzle-kit; this line just makes no-ops obvious.
    reason: "migrations applied (idempotent — same hash means no-op)",
  }),
);

await pool.end();
