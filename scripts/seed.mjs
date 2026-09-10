// Seed CLI: idempotent local-dev seed for a fresh database.
//   npm run db:seed
// Safe to re-run; never overwrites existing workspaces.
// Reads DATABASE_URL from the environment or .env.
import "dotenv/config";

const { seed } = await import("../src/db/seed.ts");
const { db, pool } = await import("../src/db/index.ts");
const { sessions, conversations } = await import("../src/db/schema.ts");

let exitCode = 0;
try {
  const { inserted } = await seed(db, { sessions, conversations });
  // Make idempotency observable: distinguish fresh vs. already-seeded.
  let sessionsCount = null;
  try {
    const result = await pool.query("SELECT count(*)::int AS count FROM chat_sessions");
    sessionsCount = result.rows[0]?.count ?? null;
  } catch {
    // Non-fatal — keep inserted as source of truth.
  }
  console.log(
    JSON.stringify({
      operation: "db.seed",
      inserted,
      reason: inserted === 1 ? "seeded demo workspace" : "already seeded",
      sessions: sessionsCount,
    }),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const causeMsg =
    error instanceof Error && error.cause instanceof Error
      ? error.cause.message
      : "";
  const combined = `${message} ${causeMsg}`;
  if (
    combined.includes("ECONNREFUSED") ||
    combined.includes("connect") ||
    combined.includes("Failed query")
  ) {
    console.error(
      JSON.stringify({
        operation: "db.seed",
        error:
          "PostgreSQL not reachable at DATABASE_URL — run docker compose up -d and check DATABASE_URL.",
        detail: message,
      }),
    );
  } else {
    console.error(JSON.stringify({ operation: "db.seed", error: message }));
  }
  exitCode = 1;
} finally {
  try {
    await pool.end();
  } catch {}
  if (exitCode !== 0) process.exit(exitCode);
}
