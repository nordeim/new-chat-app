-- Nave & Spire — PostgreSQL init script
-- Runs once on first container creation (Docker entrypoint)
-- Creates extensions required by the application.

-- pgcrypto: for gen_random_uuid() used in all uuid primary keys
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pg_trgm: for trigram-based fuzzy text search (product search, Phase 1)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Verify extensions are installed
DO $$
BEGIN
  RAISE NOTICE 'pgcrypto extension: %', EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto');
  RAISE NOTICE 'pg_trgm extension: %', EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm');
END
$$;
