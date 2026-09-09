import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("conversations_owner_updated_idx").on(table.owner, table.updatedAt),
  ],
);
