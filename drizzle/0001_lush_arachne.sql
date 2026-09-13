-- Backlog B1 (pass-9 M-1 complete closure): server-side search moves from
-- JSONB expansion to a database-maintained search corpus served by a trigram
-- GIN index. Statements are ordered: extension -> helper function -> column
-- -> index, because a STORED generated column needs its expression callable
-- at ALTER time and the index needs the operator class from pg_trgm.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
-- CREATE OR REPLACE so the definition is idempotent against the copy that
-- infrastructure/postgres/init/00-create-extensions.sql installs on fresh
-- volumes (that copy exists so the documented prototyping path
-- `npx drizzle-kit push` can build the generated column on a cold database).
CREATE OR REPLACE FUNCTION "messages_content_text"("messages" jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  SELECT coalesce(string_agg(coalesce(message->>'content', ''), E'\n'), '')
  FROM jsonb_array_elements("messages") AS message
$fn$;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "search_text" text GENERATED ALWAYS AS (title || E'\n' || "messages_content_text"("messages")) STORED NOT NULL;--> statement-breakpoint
CREATE INDEX "conversations_search_idx" ON "conversations" USING gin ("search_text" gin_trgm_ops);
