// Retention CLI: prunes idle sessions (cascade deletes their conversations)
// and optionally stale conversations. Run against the deployment database:
//   npm run prune -- --idle-days 30 [--conversation-days 90]
// Schedule per your retention policy (e.g. weekly cron). Reads DATABASE_URL
// from the environment or .env.
import "dotenv/config";

const args = process.argv.slice(2);
function numberFlag(name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = Number(args[index + 1]);
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`${name} expects a positive number of days.`);
    process.exit(2);
  }
  return value;
}

const idleDays = numberFlag("--idle-days") ?? 30;
const conversationDays = numberFlag("--conversation-days");

const { pruneIdleSessions, pruneStaleConversations } = await import(
  "../src/lib/retention.ts"
);
const { db, pool } = await import("../src/db/index.ts");
const { sessions, conversations } = await import("../src/db/schema.ts");

try {
  const sessionsDeleted = await pruneIdleSessions(
    db,
    { sessions },
    { idleDays },
  );
  let conversationsDeleted = 0;
  if (conversationDays !== undefined) {
    conversationsDeleted = await pruneStaleConversations(
      db,
      { conversations },
      { olderThanDays: conversationDays },
    );
  }
  console.log(
    JSON.stringify({
      operation: "retention.prune",
      idleDays,
      conversationDays: conversationDays ?? null,
      sessionsDeleted,
      conversationsDeleted,
    }),
  );
} finally {
  await pool.end();
}
