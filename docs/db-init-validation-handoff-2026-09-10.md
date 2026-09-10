# DB Init Validation Handoff — Option B Cold-Start Drill

> **Date:** 2026-09-10 18:10 UTC · **HEAD:** `8e44e28` · **DB:** `new_chat_postgres` on `5433` (fresh after `down -v`) · **Plan:** `docs/db-init-root-cause-validation-plan.md` (Phases A–D + Gates G1–G8)
> **Drill approved:** `docker compose down -v` (destroys `chat_data`) → `up -d` → migrate → seed — previous `5 sessions / 3 conversations` intentionally wiped, fresh `1/1` seeded.

---

## Verdict: ✅ NO BUG — Observability gap, not a failure (H1 confirmed)

The operator's screenshot shows **correct behavior misread as failure**:

- `npm run db:migrate`'s apparent "silence" is a **fast no-op spinner** (`[⣷] applying…` → ANSI `2K/1G` clear in <50 ms → `[✓] migrations applied successfully!` with `M-bM-#` glyphs via `cat -A`). On warm DB (hash already `d5d43cb…`) and on fresh DB alike, the same `[✓]` appears — some terminals show only the 3 header lines before prompt, looking like "nothing happened" but `exit 0` + DB state prove success.
- `npm run db:seed → {"inserted":0}` is the **correct idempotent result** when `SELECT count(*) FROM chat_sessions > 0`. Fresh DB correctly gave `{"inserted":1}` then `{"inserted":0}` on second call (see cold-start evidence below). `inserted:0` means "already seeded, nothing to do" — not "failed".
- `(venv) pete@pop-os` is a **Python venv PS1 prefix** (`VIRTUAL_ENV=/opt/venv`, `python3=/opt/venv/bin/python3`, `which psql` exits 1) — Node/drizzle-kit ignore it entirely (proven A3: identical output with/without venv).

No code defect in `drizzle.config.ts`, `src/db/*`, `docker-compose.yml`, `00-create-extensions.sql`, or `scripts/seed.mjs`. DB is healthy and all gates green.

---

## Live Evidence (pasted, not claimed)

### Gates G1–G4 (always first)

| Gate | Command | Output | Verdict |
|------|---------|--------|---------|
| G1 Typecheck | `npm run typecheck` | `Generating route types… ✓ Types generated successfully` | ✅ |
| G2 Lint | `npm run lint` | `eslint .` exit 0, 0 problems | ✅ |
| G3 Unit | `npm test` | `15 pass, 0 fail` (origin 7 + core 8) ~290 ms | ✅ |
| G4 Build | `npm run build` | `Compiled successfully in ~700ms`, 6 routes (`○ /`, `○ /_not-found`, `ƒ /api/chat`, `ƒ /api/conversations`, `ƒ /api/conversations/[id]`, `ƒ /api/health`) | ✅ |

### Phase A — "Silent migrate" reproduction

| # | Command | Output | Meaning |
|---|---------|--------|---------|
| A1 | `npm run db:migrate 2>&1 \| cat -A` | `No config path… Reading config… Using 'pg' driver… [M-bM-#M-7] applying…^[[2K^[[1G[M-bM-^\M-^S] migrations applied successfully!` | ANSI spinner + clear + `[✓]` — not silent, just ANSI-cleared fast. |
| A2 | `npm run db:migrate --verbose` | `npm verbose exit 0 / npm info ok` + same `[✓]` | Verbose proves `exit 0`. |
| A3 | with/without venv | `VIRTUAL_ENV=/opt/venv` vs. none — both `… [✓] migrations…` | venv cosmetic only. |
| A4 | hash vs journal | `drizzle.__drizzle_migrations hash d5d43cb…` vs `drizzle/meta/_journal.json when 1789009968151` | Match → no-op expected; mismatch would trigger real apply. |

### Phase B — Seed idempotency

| # | Command | Output | Meaning |
|---|---------|--------|---------|
| B1 | `npm run db:seed` twice (warm DB) | `{"inserted":0}` + `{"inserted":0}` | Correct: `count=5` → 0 twice. |
| B2 | `rg count\|inserted src/db/seed.ts` | `count>0 → {inserted:0}` else `insert {inserted:1}` | Logic correct. |
| B3 | prior cold-start evidence | `db-init-and-e2e-plan.md: {inserted:1} then {inserted:0}` | Proves fresh path is 1→0. |

### Phase C — Component validation

| # | Check | Evidence | Verdict |
|---|-------|----------|---------|
| C1 | `drizzle.config.ts` single source | `defineConfig({url: DATABASE_URL, verbose:true, strict:true})` throws if missing | ✅ |
| C2 | `src/db/index.ts` authority | `throw "DATABASE_URL is required"` at import; Pool cached on `globalThis` in dev | ✅ |
| C3 | Init script | `CREATE EXTENSION IF NOT EXISTS pgcrypto / pg_trgm` + logs `ready to accept connections` once at first volume | ✅ |
| C4 | Docker wiring | `5433:5432 chat_data PGDATA healthcheck pg_isready` matches `.env.example` | ✅ |
| C5 | Schema ↔ SQL ↔ journal | `chat_sessions PK text`, `conversations PK uuid FK cascade index owner_updated` vs SQL identical; `extensions pgcrypto 1.3 pg_trgm 1.6`, `tables chat_sessions,conversations`, `migrations rows 1` | ✅ |
| C7 | `scripts/seed.mjs` cleanup | `finally { await pool.end() }` present | ✅ — would hang otherwise, not observed. |

### Phase D — False causes excluded

| # | Check | Output | Verdict |
|---|-------|--------|---------|
| D1 | `which psql` | exit 1 | `psql` absent by design — app uses `pg` Pool. |
| D2 | `package.json type` | no `type:module` (Next.js) — warning cosmetic | Not a bug. |
| D3 | venv | `$VIRTUAL_ENV=/opt/venv` | PS1 only. |

### Cold-Start Drill (Option B — destroys chat_data, as approved)

| Step | Command | Output | Exit |
|------|---------|--------|------|
| Pre | `count(*) FROM chat_sessions` | `5` / `3 conversations` | — |
| `down -v` | `sudo docker compose down -v` | `Container Removed / Volume Removed / Network Removed` | 0 |
| `up -d` | `sudo docker compose up -d` | `Volume Created / Container Started`; `docker ps` → `Up Less than a second (health: starting)` → 10s → `healthy` | 0 |
| Logs | `docker logs` | `PostgreSQL init process complete; ready for start up` + `database system is ready to accept connections` | — |
| Tables before migrate | `information_schema.tables` | `(none)` | — |
| Extensions | `pg_extension` | `pg_trgm, pgcrypto` | ✅ |
| **G5 fresh migrate** | `npm run db:migrate` | `[⣷] → [⣯] → [✓] migrations applied successfully!` (animates on fresh apply) | 0 |
| **G6 fresh seed 1** | `npm run db:seed` | `{"operation":"db.seed","inserted":1}` | 0 |
| **G6 fresh seed 2** | `npm run db:seed` | `{"operation":"db.seed","inserted":0}` | 0 |
| Counts after | `SELECT count(*)` | `sessions:1 / conversations:1 / migration hash d5d43cb… / title "Welcome to Kimi — seeded demo"` | — |
| Build | `npm run build` | `○/` `ƒ` 6 routes | 0 |
| Health (no-key) | `PORT=3004 NVIDIA_API_KEY="" npm start & curl /api/health + /api/conversations` | `{"ok":true}` + `{"conversations":[],"configured":false}` (0 for new cookie — seed owner isolated, correct) | ✅ |
| E2E fresh DB | `TEST_BASE_URL=http://localhost:3004 npx playwright test` | `16 passed (13.4s)` (12 workspace + 4 stream-ui) | 0 |
| Teardown | `pkill next-server 3004` + `ss -tlnp` | `3004 free` | — |

**Live probe (opportunistic):** `curl https://kimi-chat.jesspete.shop/api/health → {"ok":true}` + `set-cookie: kimi_session=… Secure; HttpOnly; SameSite=strict` + `{"conversations":[],"configured":true}` — live DB was not affected by local `down -v`.

---

## Root-Cause Ranking (confirmed)

| Rank | Hypothesis | Verdict |
|------|------------|---------|
| **H1** | **No bug — fast no-op + idempotent seed misread as failure** (spinner ANSI-cleared, `inserted:0` correct) | **Confirmed** — A1–A4 + B1–B3 + cold-start 1→0 prove it. |
| H2 | Stale volume hiding fresh-DB path | **Disproven this drill** — fresh volume applied extensions + migration + seed 1→0 correctly. |
| H3 | Missing fresh-DB affordance (3 steps in order) | **Confirmed as DX gap** — flow works but is not self-evident; operator had to remember order. |
| H4 | Silent success should be louder (same `[✓]` for 0 vs 1 applied) | **Confirmed as DX gap** — success message identical for no-op vs apply. |
| H5 | Seed log gives no reason for `0` | **Confirmed as DX gap** — log is `{inserted:0}` with no `reason: already seeded`. |

---

## Optimal Fix (as planned — not yet implemented per Option B contract)

**Recommended: Option 1 + Option 2 preflight (minimal DX, zero migration-semantics risk):**

1. **Enhanced logs:** `scripts/seed.mjs` already `pool.end()`-clean; add `"reason":"already seeded"` + `sessions` count when `inserted:0`; add `scripts/migrate.mjs` wrapper that after `drizzle-kit migrate` queries `SELECT hash FROM drizzle.__drizzle_migrations` + `SELECT count(*)` and logs `{"operation":"db.migrate","migrationsApplied":0|1,"hash":"…","sessions":N}` — makes idempotency observable and fixes H1/H4/H5.
2. **Composite affordance:** Add `package.json "db:setup": "node scripts/db-setup.mjs"` that checks `DATABASE_URL` + `pool.query("select 1")` with curated error (`PostgreSQL not reachable at 127.0.0.1:5433 — run docker compose up -d`) vs raw `ECONNREFUSED`, then runs migrate → seed → summary — fixes H2/H3. Update README Docker Quick Start to `npm run db:setup` (manual steps as fallback).
3. **Docs-only:** Add README Troubleshooting rows: "`[✓] migrations applied` appears for both fresh and no-op; `inserted:0` means already seeded; `docker compose down -v` for true fresh-DB test."

**Tradeoffs:** + ~5 ms extra query per command, − one new script to maintain; no schema/journal change, no `push` promotion.

**Next:** If you want it built, say **Option C — validate + implement fix** and I'll implement Option 1+2, re-run G1–G8, and commit on `main`.

---

## Current State Note

Local `new_chat_postgres` is now **fresh** (`1 session / 1 conversation` = seed demo) after the approved `down -v`. Previous local conversations were intentionally wiped; `scandihaven_postgres` unaffected. If you need the prior `5/3` back, restore from a dump or re-create via the app — there is no automatic backup of `chat_data` (volume `local` driver).
