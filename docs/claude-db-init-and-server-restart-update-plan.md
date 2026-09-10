# CLAUDE.md Update Plan — DB Initialization & Server Restart Procedures

> **Scope:** `CLAUDE.md` (AI instructions, read fresh every conversation) vs. current codebase HEAD `92473d6`
> **Trigger:** DB init observability fix (`fix(db): make init observability explicit + add db:setup` — `scripts/migrate.mjs`, `scripts/db-setup.mjs`, `scripts/seed.mjs` enhanced, `package.json` `db:setup`, `AGENTS.md`/`README.md` updated; `CLAUDE.md` still references stale `npx drizzle-kit push` and lacks DB init lifecycle + server restart procedures)
> **Method:** Six-phase meticulous — ANALYZE (current CLAUDE vs. codebase) → PLAN (this doc) → VALIDATE (diff & gates) → IMPLEMENT → VERIFY → DELIVER — no edits until plan approved
> **Date:** 2026-09-10 · **Author:** Claw Code

---

## 1. Deep Understanding — What CLAUDE.md currently says vs. what the codebase does

### 1.1 Current CLAUDE.md structure (relevant excerpts)

- **Development Workflow → Environment Setup** (line ~70):
  ```bash
  npm ci
  cp .env.example .env
  npx drizzle-kit push   # apply schema to the dev database
  npm run dev
  ```
  *No mention of `db:migrate`, `db:setup`, `db:seed`, Docker, or preflight.*

- **Build Commands table** (7 rows): `dev`, `build`, `start`, `typecheck`, `lint`, `test`, `test:e2e` — **missing** all `db:*` rows.

- **Database / Data Layer** (2 bullets): `Drizzle + pg.Pool (cached on globalThis)`, `Use parameterized queries` — **no** lifecycle (`generate → migrate → seed → setup`), no idempotency note, no `DATABASE_URL` single-source, no init script `pgcrypto/pg_trgm`.

- **No section** for: DB init lifecycle, cold-start vs warm-start, `docker compose` local DB, server restart triggers/procedures, port-conflict handling (`3000` busy → `3004`), health verification (`curl /api/health`), troubleshooting `PostgreSQL not reachable` / `inserted:0`.

### 1.2 What the codebase now does (HEAD `92473d6`, validated this session)

| Area | Current implementation | Evidence |
|------|------------------------|----------|
| **Drizzle config** | `drizzle.config.ts` `defineConfig({ dialect:"postgresql", schema:"./src/db/schema.ts", out:"./drizzle", dbCredentials:{url: DATABASE_URL}, verbose:true, strict:true })` reads `DATABASE_URL` via `dotenv/config`, throws if missing — single source, no hard-coded URL. | `cat drizzle.config.ts` |
| **Migrations** | Journal `drizzle/meta/_journal.json` single entry `0000_flimsy_sage` → SQL `drizzle/0000_flimsy_sage.sql` (chat_sessions + conversations + FK cascade + index) + `drizzle/__drizzle_migrations` hash `d5d43cb…` (DB `drizzle` schema). | `cat _journal.json`, `pool.query("SELECT hash FROM drizzle.__drizzle_migrations")` |
| **Init script** | `infrastructure/postgres/init/00-create-extensions.sql` `CREATE EXTENSION IF NOT EXISTS pgcrypto / pg_trgm` — runs once on first volume creation. | `cat 00-create-extensions.sql`, `SELECT extname FROM pg_extension` → `pgcrypto 1.3, pg_trgm 1.6` |
| **Pool** | `src/db/index.ts` `new Pool({connectionString: DATABASE_URL})` cached on `globalThis` in dev, `drizzle(pool)`, throws at import if `DATABASE_URL` missing — every API route fails fast. | `cat src/db/index.ts` |
| **Scripts** | `package.json` `db:generate → drizzle-kit generate`, `db:migrate → node --experimental-strip-types scripts/migrate.mjs` (wrapper: preflight `select 1` curated JSON + `spawnSync drizzle-kit migrate` + post `{hash,sessions,conversations}`), `db:seed → scripts/seed.mjs` (now `{inserted,reason,sessions}` + curated ECONNREFUSED), `db:setup → scripts/db-setup.mjs` (preflight + migrate + seed + `{migrationsApplied,inserted,hash,sessions}`), `prune` via `retention.ts`. All `.mjs` with explicit `.ts` imports (`--experimental-strip-types`), injected `{db,tables}` pattern. | `cat package.json`, `cat scripts/migrate.mjs`, `cat scripts/db-setup.mjs`, `cat scripts/seed.mjs` |
| **Idempotency** | `migrate` no-op when hash matches → same `[✓] migrations applied successfully!` but wrapper logs `hash/sessions` to distinguish; `seed` returns `{inserted:1}` on fresh (`count=0`) else `{inserted:0, reason:"already seeded"}` (verified cold-start `down -v → up -d → db:setup 1/1 → 0/0`). | `npm run db:setup` cold-start logs |
| **Docker** | `docker-compose.yml` `postgres:17-alpine` `5433:5432` `chat_data` `chat_net` healthcheck `pg_isready -U chat_user -d chat_db` every 5s. `new_chat_postgres Up (healthy)` in ~10s. | `cat docker-compose.yml`, `sudo docker ps` |
| **Server restart triggers** | Must restart on: `.env` change (`DATABASE_URL`, `NVIDIA_API_KEY`), new migration applied, `docker compose` (re)start, `next.config.ts` / `globals.css` token change, `package.json` dep change. Dev `npm run dev` HMR keeps `globalThis` Pool; prod `npm run build && npm start` needs full restart. Port `3000` often busy (`scandihaven_postgres` sibling on 5432, Next on 3000/3001); workaround `PORT=3004 npm start -- --port 3004` + `TEST_BASE_URL=http://localhost:3004` (`playwright.config.ts` `reuseExistingServer:true`). | `AGENTS.md` env notes, `db-init-validation-handoff` cold-start, `E2E 3004` workaround |
| **Health verification** | `curl http://localhost:3000/api/health → {"ok":true}` (DB `select 1` probe, no provider key); `curl /api/conversations → {conversations:[], configured:true|false}` + `set-cookie: kimi_session … HttpOnly; SameSite=strict` + `cache-control: no-store`; headers `nosniff/DENY/HSTS/CSP/no-store`. | `curl -s http://localhost:3004/api/health`, `curl -sI /api/conversations` |
| **Troubleshooting (README)** | `DATABASE_URL is required`, `PostgreSQL not reachable at DATABASE_URL`, `inserted:0 already seeded`, `health {"ok":false}`, `Connect NVIDIA` banner — all with curated JSON errors from wrappers. | `README.md` Troubleshooting |

### 1.3 Gap analysis — what CLAUDE.md is missing

| Gap | Impact if not fixed | AGENTS/README already have it | CLAUDE still lacks it |
|-----|---------------------|-------------------------------|-----------------------|
| No `db:*` in Build Commands table | Agent runs `npx drizzle-kit push` (prototyping) in prod path, skips journal-driven `migrate` | ✅ `AGENTS` table now has `db:generate/migrate/seed/setup` + notes | ❌ |
| Environment Setup says `npx drizzle-kit push` | New agent never learns `docker compose up -d → db:setup → health` cold-start; will hit `ECONNREFUSED` without curated guidance | ✅ `README` Docker Quick Start `db:setup` | ❌ |
| No DB lifecycle section (generate → migrate → seed → setup, idempotency) | Agent treats `inserted:0` as failure, re-seeds or drops data | ✅ `README` Database lifecycle | ❌ |
| No preflight / curated error contract | Agent surfaces raw `ECONNREFUSED` / `Failed query` stack instead of `"PostgreSQL not reachable — run docker compose up -d"` | ✅ `scripts/migrate.mjs`/`seed.mjs` JSON | ❌ |
| No server restart procedures | Agent edits `.env` or applies migration and does not restart → `DATABASE_URL is required` at import, stale `globalThis` Pool, or `EADDRINUSE` on `3000`; E2E fails because `reuseExistingServer` holds stale server with wrong `NVIDIA_API_KEY`/`DATABASE_URL` | ✅ `AGENTS` env notes + `db-init-validation-handoff` cold-start | ❌ |
| No port-conflict / health-check guidance | Agent fails `EADDRINUSE :::3004` or never verifies `curl /api/health` | ✅ `README` Troubleshooting + `AGENTS` | ❌ |
| No verification order tie-in for DB touch | Agent commits without `db:migrate → seed → health → build → test:e2e` chain | ✅ `AGENTS` Verification order (implicitly) | ❌ |

---

## 2. Plan — Exact edits to CLAUDE.md (no code until approved)

### Design constraints for CLAUDE.md

- **Brief & practical** — file is read fresh every conversation; keep edits concise, command-copy-paste ready.
- **Mirror AGENTS/README** — do not diverge; reuse same script names, env names, and curated error strings.
- **Do not weaken gates** — keep `typecheck → lint → test → build` order; DB gates are pre-conditions, not replacements.
- **Keep header** `IMPORTANT: File is read fresh… Be brief and practical.`

### Edit A — `Development Workflow → Environment Setup` (replace 4-line block)

**Old (lines ~68–72):**
```bash
npm ci                                # Node.js >= 22
cp .env.example .env                  # set DATABASE_URL (NVIDIA_API_KEY optional for UI tests)
npx drizzle-kit push                  # apply schema to the dev database
npm run dev                           # http://localhost:3000
```

**New:**
```bash
npm ci                                # Node.js >= 22
cp .env.example .env                  # set DATABASE_URL (NVIDIA_API_KEY optional for UI tests)
# Local Postgres (Docker) — once per cold-start:
docker compose up -d                  # postgres:17 on 127.0.0.1:5433 (healthy in ~10s)
npm run db:setup                      # migrate + seed in one (curated JSON; idempotent — 1/1 fresh → 0/0 warm)
# Or step-by-step: npm run db:migrate (logs hash/sessions) + npm run db:seed (logs inserted/reason)
curl http://localhost:3000/api/health # {"ok":true} — DB reachable
npm run dev                           # http://localhost:3000
# Schema change: edit src/db/schema.ts → npm run db:generate → commit drizzle/*.sql + drizzle/meta/
# Cold-start reset: docker compose down -v && docker compose up -d && npm run db:setup
```

*Rationale:* Replaces prototyping `push` with production-safe `migrate/setup`, adds Docker, health check, and cold-start affordance; matches `AGENTS`/`README` Docker Quick Start.

### Edit B — `Build Commands` table (add DB rows, keep existing 7)

**Add after `npm run test:e2e` row:**

| Command | Purpose |
|---------|---------|
| `npm run db:generate` | Generate SQL migration from `src/db/schema.ts` → `drizzle/*.sql` + `drizzle/meta` (commit both) |
| `npm run db:migrate` | Apply migrations (journal-driven, idempotent; logs `hash/sessions`; `[✓]` appears for both fresh and no-op — check logged hash) |
| `npm run db:seed` | Seed demo workspace on fresh DB (`{inserted:1, reason:"seeded demo workspace"}` → `{inserted:0, reason:"already seeded"}` on re-run) |
| `npm run db:setup` | `migrate + seed` in one (logs `{migrationsApplied, inserted, hash, sessions}`; `1/1` fresh → `0/0` warm; curated `PostgreSQL not reachable` preflight) |
| `npx drizzle-kit push` | Push schema directly (prototyping only — not production-safe) |

*Rationale:* Completes the `db:*` surface introduced in `package.json` `92473d6`; notes idempotency observability (H1/H5) so agent does not misread `[✓]` / `inserted:0`.

### Edit C — `Database / Data Layer` section (replace 2 bullets with 5)

**Old (2 bullets):**
- Drizzle + pg.Pool (cached on globalThis in dev)…
- Use parameterized Drizzle queries…

**New:**
- **Source of truth:** `drizzle.config.ts` reads `DATABASE_URL` via `dotenv/config` (`verbose:true strict:true`); no hard-coded URL. `drizzle` schema `drizzle` / table `__drizzle_migrations` stores hash `d5d43cb…`; SQL `drizzle/0000_flimsy_sage.sql`; extensions `pgcrypto` + `pg_trgm` via `infrastructure/postgres/init/00-create-extensions.sql` (once per volume).
- **Pool:** `src/db/index.ts` `pg.Pool` cached on `globalThis` in dev, `drizzle(pool)`; throws at import if `DATABASE_URL` missing — every API route fails fast.
- **Lifecycle:** `npm run db:generate` (edit schema → generate) → `npm run db:migrate` (wrapper: preflight `select 1` → `spawnSync drizzle-kit migrate` → post `{hash,sessions}`) → `npm run db:seed` (idempotent, `{inserted,reason,sessions}`) → `npm run db:setup` (migrate+seed, `{migrationsApplied,inserted}`). All via `node --experimental-strip-types scripts/*.mjs` (explicit `.ts` imports, injected `{db,tables}`).
- **Idempotency:** `migrate` no-op when hash matches (same `[✓]` — check logged hash); `seed` `inserted:0` when `count>0` means "already seeded", not failure.
- **Queries:** Parameterized Drizzle only; never string-concatenate SQL. See `scripts/migrate.mjs`/`db-setup.mjs` for curated `PostgreSQL not reachable at DATABASE_URL — run docker compose up -d` preflight pattern.
```

### Edit D — New subsection `Server Restart Procedures` (insert after `Build Commands` or after `Environment Variables`)

**New section (concise, copy-paste):**

```markdown
### Server Restart Procedures

**When to restart:**
- `.env` changed (`DATABASE_URL`, `NVIDIA_API_KEY`) — `src/db/index.ts` throws at import; Pool re-reads env only on (re)start.
- New migration applied (`npm run db:migrate` / `db:setup`) or `docker compose up/down`.
- `next.config.ts`, `src/app/globals.css` tokens, or `package.json` deps changed.

**Dev server:**
```bash
# Ctrl+C then
npm run dev                           # HMR keeps globalThis Pool; no docker restart needed for code-only edits
```

**Production preview (E2E prerequisite):**
```bash
npm run build && npm start            # reads .env at boot; needs DATABASE_URL
# Port 3000 busy (sibling holds 3000/3001)? Use 3004:
PORT=3004 npm start -- --port 3004 &  # bg; TEST_BASE_URL=http://localhost:3004 npx playwright test
curl http://localhost:3004/api/health # {"ok":true}
# Stale server masks new env (reuseExistingServer:true) — kill before re-running with new DATABASE_URL/NVIDIA_API_KEY:
pkill -f "next start.*3004"; PORT=3004 NVIDIA_API_KEY="" npm start -- --port 3004
```

**Docker DB:**
```bash
docker compose up -d                  # start (health: starting → healthy in ~10s)
docker compose logs -f postgres       # "ready to accept connections"
docker compose down                   # stop (keep chat_data)
docker compose down -v                # RESET — deletes chat_data (cold-start); then npm run db:setup
```

**Verify after restart:**
```bash
curl -s http://localhost:3000/api/health          # {"ok":true}
curl -s http://localhost:3000/api/conversations | grep configured
# 500 health → check DATABASE_URL, docker ps (healthy?), pg_isready -U chat_user -d chat_db
```
```

*Rationale:* Captures the `down -v` cold-start drill, `EADDRINUSE` workaround, `reuseExistingServer` footgun, and health verification — all re-proven in `db-init-validation-handoff` but absent from `CLAUDE.md`.

### Edit E — Optional: `Environment Variables` table — add one-line note to `DATABASE_URL`

**Old:** `PostgreSQL connection string | Required; app throws without it`

**New:** `PostgreSQL connection string | Required; app throws at import without it; local `postgresql://chat_user:chat_secret@127.0.0.1:5433/chat_db` (Docker 5433:5432); wrappers preflight `select 1` → curated JSON on ECONNREFUSED`

### Edit F — `Code Quality Standards → Gate order` (one-line addition)

**Old:** `Gate order: npm run typecheck → npm run lint → npm test → npm run build.`

**New:** `Gate order: npm run typecheck → npm run lint → npm test → npm run build. If DB touched: npm run db:setup → curl /api/health → (if UI touched) npm run test:e2e (build + start on 3004 if 3000 busy).`

---

## 3. Validation Plan (tick with file/line or command output)

| # | Check | How | Expected |
|---|-------|-----|----------|
| V1 | `CLAUDE.md` diff matches Edits A–F above | `git diff CLAUDE.md` after edits | 4 sections touched, no other file changed, header `IMPORTANT` kept |
| V2 | No divergence from `AGENTS.md`/`README.md` | `rg -n "db:setup\|db:migrate\|DATABASE_URL" AGENTS.md README.md CLAUDE.md` | Same script names, same curated strings, same `5433:5432` |
| V3 | Typecheck still green | `npm run typecheck` | `✓ Types generated successfully` |
| V4 | Lint still green (CLAUDE.md is not linted, but no TS change) | `npm run lint` | `0 problems` |
| V5 | `db:setup` still green | `npm run db:setup` (warm) → `migrationsApplied:0 inserted:0`; cold-start not required for this edit but `down -v` path remains documented | Warm `0/0`, cold would be `1/1` |
| V6 | `CLAUDE.md` still brief & practical | `wc -l CLAUDE.md` stays ~250–320 lines (not bloated) | Readable fresh |

---

## 4. Done-When & Next Action (requires your confirmation)

**Done when:**
- [ ] Edits A–F applied to `CLAUDE.md` exactly as above (or with your requested wording tweaks).
- [ ] `git diff CLAUDE.md` reviewed; `npm run typecheck/lint/test` still green; `npm run db:setup` warm `0/0` still logs correctly.
- [ ] This plan file marked `[x]` per edit; one atomic commit on `main` with message `docs(claude): refresh DB init lifecycle + server restart procedures (db:setup, preflight, port/health, cold-start)`.

**Next action — pick one:**

- **Option A — "apply as planned"**: Implement Edits A–F verbatim, re-verify `typecheck→lint→test→db:setup`, commit on `main`.
- **Option B — "apply with tweaks"**: Tell me which subsection to shorten/expand (e.g., trim Server Restart Procedures, keep only Environment Setup + Build Commands), then I'll apply the trimmed version.
- **Option C — "plan only"**: Keep this plan as doc, do not touch `CLAUDE.md`.

Tell me which option to execute — I will not edit `CLAUDE.md` until you confirm.
