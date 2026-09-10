import { and, lt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

// Table objects are injected by the caller so this module stays loadable in
// every runtime context (Next.js bundler, tsc, and Node type-stripping for
// the prune CLI) — only drizzle-orm is a runtime import here.
type SessionsTable = typeof import("../db/schema").sessions;
type ConversationsTable = typeof import("../db/schema").conversations;
type Db = NodePgDatabase<Record<string, never>>;

export interface RetentionOptions {
  /** Delete sessions whose last request is older than this many days. */
  idleDays: number;
}

export interface StaleConversationOptions {
  /** Delete conversations not updated within this many days. */
  olderThanDays: number;
}

// Idle sessions cascade-delete their conversations (schema FK). A session is
// idle when its last chat lease predates the cutoff; sessions that only ever
// loaded the workspace have the epoch default and are pruned as well.
export async function pruneIdleSessions(
  db: Db,
  tables: { sessions: SessionsTable },
  options: RetentionOptions,
) {
  const cutoff = new Date(Date.now() - options.idleDays * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(tables.sessions)
    .where(lt(tables.sessions.lastRequest, cutoff))
    .returning({ id: tables.sessions.id });
  return deleted.length;
}

// Opt-in companion for a conversation retention window shorter than session
// idleness: removes aged conversations without touching their sessions.
export async function pruneStaleConversations(
  db: Db,
  tables: { conversations: ConversationsTable },
  options: StaleConversationOptions,
) {
  const cutoff = new Date(
    Date.now() - options.olderThanDays * 24 * 60 * 60 * 1000,
  );
  const deleted = await db
    .delete(tables.conversations)
    .where(and(lt(tables.conversations.updatedAt, cutoff)))
    .returning({ id: tables.conversations.id });
  return deleted.length;
}
