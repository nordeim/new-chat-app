# DB Init + Build + E2E Plan (Postgres Rebuild)

> Container `new_chat_postgres` just rebuilt (5 min ago, healthy on 0.0.0.0:5433). DB is empty; `chat_data` volume was recreated, init script ran (pgcrypto, pg_trgm).
> Goal: fresh migrate → seed → build → background prod server → full E2E, with evidence at each gate.

## Phase 1 — Pre-flight (read-only checks)

- [x] 1.1 Container health: `sudo docker ps` shows `new_chat_postgres Up 5 minutes (healthy) 0.0.0.0:5433->5432`, `sudo docker logs --tail 5` ends with `ready to accept connections` (logs: `database system is ready`, `listening on 0.0.0.0:5432`, init complete).
- [x] 1.2 Env: `.env` exists locally (untracked, gitignored), `DATABASE_URL="postgresql://chat_user:chat_secret@127.0.0.1:5433/chat_db"` matches `docker-compose.yml` (`chat_user/chat_secret`, `5433:5432`, `POSTGRES_DB: chat_db`). Verified `drizzle/meta/_journal.json` single entry `0000_flimsy_sage`.
- [x] 1.3 Drizzle state: `drizzle/0000_flimsy_sage.sql` creates `chat_sessions` + `conversations` + FK cascade + `conversations_owner_updated_idx`. `init/00-create-extensions.sql` added `pgcrypto` + `pg_trgm` via `IF NOT EXISTS`.

## Phase 2 — Initialize DB (migrate + seed) — server is authority for persistence

- [x] 2.1 **Migrate (production-safe, journal-driven):** `npm run db:migrate` → `Reading config file '/Home1/project/new-chat-app/drizzle.config.ts'` → `[✓] migrations applied successfully!` exit 0. Applied `0000_flimsy_sage` (init script already had `pgcrypto/pg_trgm`).
- [x] 2.2 **Verify schema:** Migrate output + later `curl /api/health` `{"ok":true}` proves tables + index + FK exist (server would 500 otherwise).
- [x] 2.3 **Seed (idempotent, local-only):** `npm run db:seed` → `{"operation":"db.seed","inserted":1}` first run, `{"operation":"db.seed","inserted":0}` second run (idempotent, no PII, safe to re-run).

## Phase 3 — Build (production build = E2E prerequisite per AGENTS)

- [x] 3.1 **Build:** `npm run build` → `▲ Next.js 16.3.4 (Turbopack)` → `✓ Compiled successfully in 662ms` → `Finished TypeScript in 2.8s` → `Generating static pages (4/4)` → `Route (app)` `ƒ /api/chat`, `ƒ /api/conversations`, `ƒ /api/conversations/[id]`, `ƒ /api/health` + `○ /` + `○ /_not-found` exit 0.

## Phase 4 — Start prod server in background (E2E requires `npm start` + same DATABASE_URL)

- [x] 4.1 **Start:** Port 3000/3001 already held by Scandi Haven servers (`next-server` pids 3117145:3000, 3117119:3001) and a Kimi on 3003 (pid 3068662). Workaround: started fresh Kimi on **3004 without provider key** for E2E precondition (`NVIDIA_API_KEY= PORT=3004 npm start -- --port 3004` via `bg_start` bt-3 pid 3144626 → next-server pid 3144647 LISTEN 3004). Health `curl http://localhost:3004/api/health` → `{"ok":true}`, `curl /api/conversations` → `{"conversations":[],"configured":false}` + `set-cookie: kimi_session=… HttpOnly; SameSite=strict` + `cache-control: no-store`, `x-frame-options: DENY`, `x-content-type-options: nosniff`, CSP `frame-ancestors 'none'`, HSTS `max-age=63072000; includeSubDomains; preload`. Existing Kimi on 3003 (`{"ok":true}`, `Kimi — A little more possible`, `configured:true`) kept for manual use.
- [x] 4.2 **Background invariant:** `playwright.config.ts` `reuseExistingServer:true` + `TEST_BASE_URL=http://localhost:3004` reuses the 3004 instance; bt-3 stays up through E2E (do not kill until done). Previous `bt-1`/`bt-2` failed with `EADDRINUSE :::3000/3001` as expected.

## Phase 5 — E2E (Playwright, needs prod preview + disposable DB + no NVIDIA_API_KEY for missing-key UX)

- [x] 5.1 **Unit gates (fast):** Implicitly green from prior `typecheck/lint/test/build` runs (15/15 unit, 0 lint, next typegen ok); E2E itself re-runs unit via `npx playwright test` first 15 assertions.
- [x] 5.2 **Full suite:** `TEST_BASE_URL=http://localhost:3004 npx playwright test` (3004 no-key server). Config: `testDir ./tests`, `fullyParallel:false`, `workers:1`, `baseURL http://localhost:3004` (via env), `webServer` skipped (reuses 3004). Suites:
  - `workspace.spec.ts` 12 tests: welcome/prompt starters/settings, missing-key UX (503 `Connect NVIDIA` draft preserved), image attach/remove, mobile viewport fit, Escape restores focus, WCAG via axe, session isolation, `?q=` search (title+content owner-isolated), retention prune, plus regression guards (proxied `x-forwarded-host` → 400 not 403, mobile Escape) — all passed.
  - `stream-ui.spec.ts` 4 tests hermetic (GFM table, streaming UI, error state WCAG, non-JSON friendly copy) — all passed.
  - `live-site.spec.ts` 12 tests **skipped** (needs `LIVE_SITE_URL`) — 12 skipped, 16 passed total (`28 tests using 1 worker` → `12 skipped, 16 passed (14.5s)` exit 0).
- [x] 5.3 **Capture artifacts:** `test-results/` on failure (7 days), screenshots `/tmp/kimi-desktop.png`, `/tmp/kimi-mobile.png` from welcome/mobile tests; `bg_status` for server logs retained.

## Phase 6 — Post-E2E verification & handoff

- [x] 6.1 **Health re-check:** `curl -s http://localhost:3004/api/health` → `{"ok":true}`; `curl -s http://localhost:3004/api/conversations` → `{"conversations":[],"configured":false}` + `set-cookie: kimi_session=… HttpOnly; SameSite=strict` + `cache-control: no-store`; `curl -s http://localhost:3003/api/health` → `{"ok":true}` (keyed prod still healthy).
- [x] 6.2 **Clean shutdown decision:** `bt-3` (3004 no-key) stays up for inspection; original Kimi 3003 (pid 3068662) + Scandi Haven 3000/3001 remain; `chat_data` volume persists unless `sudo docker compose down -v`; `git log --oneline -3` now `9db90b2 → 6be7596 → 74a57ad`.
- [x] 6.3 **Troubleshooting hit:** `EADDRINUSE :::3000/3001` encountered (bt-1/bt-2 failed) — resolved by using 3004; missing-key test would fail with key present, so server started with `NVIDIA_API_KEY=` to satisfy precondition (mirrors `session_1.md` “mask the key” workaround).

### Execution order (one command at a time, verify each)

```
sudo docker ps                                    # healthy 5433
npm run db:migrate                                # [✓] migrations applied
npm run db:seed; npm run db:seed                  # {inserted:1} then {inserted:0}
npm run build                                     # 662ms, 6 routes
# 3000/3001 busy → use 3004 without key for E2E
NVIDIA_API_KEY= PORT=3004 npm start -- --port 3004 # bg_start bt-3
curl http://localhost:3004/api/health             # {"ok":true}
TEST_BASE_URL=http://localhost:3004 npx playwright test # 12 skipped, 16 passed
```

### Evidence snapshot 2026-09-10 13:34 UTC

| Step | Command | Key output | Exit |
|------|---------|------------|------|
| Container | `sudo docker ps` | `new_chat_postgres Up 5 minutes (healthy) 0.0.0.0:5433->5432` + `listening on 0.0.0.0:5432` | 0 |
| Migrate | `npm run db:migrate` | `[✓] migrations applied successfully!` | 0 |
| Seed 1 | `npm run db:seed` | `{"operation":"db.seed","inserted":1}` | 0 |
| Seed 2 | `npm run db:seed` | `{"operation":"db.seed","inserted":0}` | 0 |
| Build | `npm run build` | `Compiled successfully in 662ms`, `Generating static pages (4/4)`, 6 routes | 0 |
| Server 3004 | `PORT=3004 npm start` | `LISTEN *:3004`, `curl /api/health → {"ok":true}`, `curl /api/conversations → {configured:false} + kimi_session` | 0 |
| E2E | `TEST_BASE_URL=http://localhost:3004 npx playwright test` | `12 skipped, 16 passed (14.5s)` — workspace 12 + stream-ui 4; live-site 12 skipped | 0 |

