// Composite DB setup: migrate + seed in one command for cold-start ergonomics.
//   npm run db:setup
// Preflights DATABASE_URL + reachability with curated errors, runs drizzle-kit
// migrate (journal-driven, idempotent), then seed (idempotent), then logs a
// combined JSON summary. Safe to re-run; never overwrites existing workspaces.
import "dotenv/config";
import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error(
    JSON.stringify({
      operation: "db.setup",
      error: "DATABASE_URL is required — set it in .env or the environment.",
    }),
  );
  process.exit(2);
}

const { db, pool } = await import("../src/db/index.ts");
const { sessions, conversations } = await import("../src/db/schema.ts");
const { seed } = await import("../src/db/seed.ts");

// Preflight: DB reachable
try {
  await pool.query("select 1");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({
      operation: "db.setup",
      error:
        "PostgreSQL not reachable at DATABASE_URL — run docker compose up -d and check DATABASE_URL.",
      detail: message,
    }),
  );
  await pool.end();
  process.exit(1);
}

// Capture before-migrate state for delta
let beforeMigrations = 0;
let beforeHash = null;
try {
  const r = await pool.query("SELECT hash FROM drizzle.__drizzle_migrations");
  beforeMigrations = r.rows.length;
  beforeHash = r.rows[0]?.hash ?? null;
} catch {
  beforeMigrations = 0;
}

// Run migrator
const result = spawnSync("npx", ["drizzle-kit", "migrate"], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(
    JSON.stringify({ operation: "db.setup", error: result.error.message }),
  );
  await pool.end();
  process.exit(1);
}
if (result.status !== 0 && result.status !== null) {
  await pool.end();
  process.exit(result.status);
}

// Capture after-migrate state
let hash = beforeHash;
let migrations = beforeMigrations;
try {
  const r = await pool.query(
    "SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1",
  );
  hash = r.rows[0]?.hash ?? null;
  const c = await pool.query("SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations");
  migrations = c.rows[0]?.count ?? beforeMigrations;
} catch {}

const migrationsApplied = migrations - beforeMigrations;

// Seed (idempotent)
let inserted = 0;
try {
  const res = await seed(db, { sessions, conversations });
  inserted = res.inserted;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({ operation: "db.setup", stage: "seed", error: message }),
  );
  await pool.end();
  process.exit(1);
}

// Final counts
let sessionsCount = null;
let conversationsCount = null;
try {
  const s = await pool.query("SELECT count(*)::int AS count FROM chat_sessions");
  sessionsCount = s.rows[0]?.count ?? null;
} catch {}
try {
  const c = await pool.query("SELECT count(*)::int AS count FROM conversations");
  conversationsCount = c.rows[0]?.count ?? null;
} catch {}

console.log(
  JSON.stringify({
    operation: "db.setup",
    migrations,
    hash,
    migrationsApplied,
    inserted,
    reason:
      inserted === 1 ? "seeded demo workspace" : "already seeded",
    sessions: sessionsCount,
    conversations: conversationsCount,
  }),
);

await pool.end();
