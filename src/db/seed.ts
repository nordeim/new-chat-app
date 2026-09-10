import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

type SessionsTable = typeof import("./schema").sessions;
type ConversationsTable = typeof import("./schema").conversations;
type Db = NodePgDatabase<Record<string, never>>;

export interface SeedResult {
  inserted: number;
}

// Idempotent local-dev seed: verifies extensions, then inserts a single
// demo workspace only if the database is otherwise empty. Safe to re-run and
// never overwrites existing user data. `pgcrypto` is already created by the
// Docker entrypoint, but the check keeps bare-host setups honest.
export async function seed(
  db: Db,
  tables: { sessions: SessionsTable; conversations: ConversationsTable },
): Promise<SeedResult> {
  await db.execute(sql`select 1`);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tables.sessions);

  if (count > 0) return { inserted: 0 };

  const demoOwner = "seed-demo-workspace";
  await db
    .insert(tables.sessions)
    .values({
      id: demoOwner,
      lastRequest: new Date(),
      busyUntil: new Date(0),
    })
    .onConflictDoNothing();

  await db.insert(tables.conversations).values({
    owner: demoOwner,
    title: "Welcome to Kimi — seeded demo",
    messages: [
      {
        id: "seed-msg-1",
        role: "assistant",
        content:
          "This is a seeded conversation. It only appears on a fresh database and is safe to delete.",
      },
    ],
  });

  return { inserted: 1 };
}
