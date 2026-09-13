import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { ChatMessage } from "@/lib/types";

export const sessions = pgTable("chat_sessions", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  lastRequest: timestamp("last_request", { withTimezone: true })
    .notNull()
    .default(new Date(0)),
  busyUntil: timestamp("busy_until", { withTimezone: true })
    .notNull()
    .default(new Date(0)),
});

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    owner: text("owner")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    messages: jsonb("messages").$type<ChatMessage[]>().notNull().default([]),
    // Backlog B1: database-maintained search corpus (title + message
    // contents, image payloads excluded) served by the trigram GIN index
    // below. The helper function is created by the 0001 migration and must
    // stay IMMUTABLE — generated columns require it.
    searchText: text("search_text")
      .generatedAlwaysAs(
        sql`title || E'\n' || messages_content_text(messages)`,
      )
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("conversations_owner_updated_idx").on(table.owner, table.updatedAt),
    index("conversations_search_idx").using(
      "gin",
      table.searchText.op("gin_trgm_ops"),
    ),
  ],
);
