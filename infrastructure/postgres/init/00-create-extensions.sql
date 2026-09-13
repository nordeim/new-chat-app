-- Nave & Spire — PostgreSQL init script
-- Runs once on first container creation (Docker entrypoint)
-- Creates extensions required by the application.

-- pgcrypto: for gen_random_uuid() used in all uuid primary keys
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pg_trgm: trigram operator class (gin_trgm_ops) for the conversations
-- search index installed by drizzle/0001_lush_arachne.sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Helper for the conversations.search_text generated column (title + message
-- contents, image payloads excluded). The same definition lives in the 0001
-- migration (CREATE OR REPLACE there, so both install paths coexist); this
-- copy exists so `npx drizzle-kit push` — the documented prototyping path —
-- can create the generated column on a cold database that never ran the
-- migration. Must stay IMMUTABLE: generated columns require it.
CREATE OR REPLACE FUNCTION "messages_content_text"("messages" jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  SELECT coalesce(string_agg(coalesce(message->>'content', ''), E'\n'), '')
  FROM jsonb_array_elements("messages") AS message
$fn$;

-- Verify extensions are installed
DO $$
BEGIN
  RAISE NOTICE 'pgcrypto extension: %', EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto');
  RAISE NOTICE 'pg_trgm extension: %', EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm');
  RAISE NOTICE 'messages_content_text function: %', EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'messages_content_text');
END
$$;
