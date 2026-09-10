# AGENTS.md

Instructions for AI coding agents working in this repository. Every line answers: "would an agent likely miss this without help?"

## What this is

Next.js 16 (App Router) chat workspace "Kimi" — streamed NVIDIA NIM responses (`moonshotai/kimi-k3`, OpenAI-compatible SSE), PostgreSQL persistence via Drizzle ORM, browser-session cookie isolation. React 19, Tailwind v4 (CSS-first), TypeScript strict.

## Commands

| Task | Command |
|------|---------|
| Install (use ci, not install) | `npm ci` |
| Dev server | `npm run dev` |
| Production build | `npm run build` |
| Lint | `npm run lint` |
| Typecheck (runs typegen first) | `npm run typecheck` |
| Unit tests (node:test, strip-types) | `npm test` |
| Single unit test file | `node --experimental-strip-types --test tests/core.test.mjs` |
| E2E / API tests (needs running server + test database) | `npm run test:e2e` |
| Live-deployment E2E (skipped unless `LIVE_SITE_URL` is set) | `LIVE_SITE_URL=https://host npx playwright test tests/live-site.spec.ts` |
| Prune idle sessions / stale conversations | `npm run prune -- --idle-days 30 [--conversation-days 90]` |
| Generate SQL migration from schema | `npm run db:generate` |
| Apply SQL migrations (production-safe) | `npm run db:migrate` |
| Seed a fresh database (idempotent) | `npm run db:seed` |
| Apply schema to dev database (prototyping) | `npx drizzle-kit push` |

Verification order: `npm run typecheck` → `npm run lint` → `npm test` → `npm run build`. The typecheck script runs `next typegen` before `tsc --noEmit`, so route-type generation can never be skipped.

## Environment

- Node.js ≥ 22 (unit tests rely on `--experimental-strip-types`), PostgreSQL required.
- `src/db/index.ts` throws at import time if `DATABASE_URL` is unset — every API route touches the database, so nothing runs without it.
- `NVIDIA_API_KEY` is server-only. Never use a `NEXT_PUBLIC_` variable for it. Missing key returns HTTP 503 with a user-facing message; this path is tested on purpose.
- `drizzle.config.ts` reads `DATABASE_URL` from the environment (via `dotenv/config`); it is the single source of truth — no hard-coded sandbox URL. For one-off pushes against another URL, use `npx drizzle-kit push --url="$DATABASE_URL"`.
- Playwright E2E tests require the production preview running (`npm run build && npm start`), a disposable `DATABASE_URL` (tests insert/delete fixtures), and no `NVIDIA_API_KEY` by design. `TEST_BASE_URL` overrides `http://localhost:3000`.

## Architecture map

- `src/app/api/chat/route.ts` — the core: origin check → session → zod validation → image magic-byte check → atomic session lease (one generation per workspace, 3 s spacing, 195 s expiry) → conversation upsert with duplicate-retry guard → NVIDIA fetch with SSE parse → persistence of final answer only → SSE to browser.
- `src/app/api/conversations/` — list / search / read / rename / delete. The list endpoint accepts `?q=` (server-side ILIKE over title and JSONB message content, owner-filtered, wildcard-escaped). Every query filters by `owner`; delete uses a transaction with `FOR UPDATE` on the session row so it cannot race a running generation.
- `src/lib/server.ts` — cookie session (`kimi_session`, 64-hex token; only the SHA-256 digest is stored as `owner`), `assertOrigin` (same-origin writes), bounded `readJson` (3 MB), `errorResponse` (structured logs without PII).
- `src/lib/retention.ts` — pure prune functions taking `{ db, tables, options }` (no relative runtime imports so the node type-stripping CLI can load them). `scripts/prune-expired.mjs` is the CLI wrapper (`npm run prune`).
- `src/db/seed.ts` + `scripts/seed.mjs` — idempotent local-dev seed (no PII, safe to re-run). Injected `{ db, tables }` so the CLI stays alias-free and type-strippable.
- `src/lib/validation.ts` — all zod schemas, shared by server and unit tests.
- `src/lib/sse.ts` — SSE parser handling cross-network-chunk events, CRLF, multi-line data; used by BOTH the API route and the browser client. Changes affect both sides.
- `src/components/chat-workspace.tsx` — the entire client UI (single component, ~1500 lines). Client-side zod schemas validate every API and stream payload.
- `src/db/schema.ts` — Drizzle schema. `messages` is JSONB on `conversations`; cascade delete via session FK.

## Non-obvious rules

- `tsconfig.json` and `eslint.config.mjs` deliberately exclude `skills/`, `sample-build/`, and `docs/` — they are reference material uploaded into the workspace, not part of the app. Do not remove these excludes; the build type-checks everything matched by `**/*.ts`.
- After lint autofix, re-run formatting/order-sensitive gates before committing; restage files so the index matches the working tree.
- Error messages returned to clients are user-facing copy (specific, actionable). Do not replace them with generic text or leak provider internals.
- Logs are structured JSON with `operation`, ids, and error types only — never message contents, cookies, or keys.
- Provider reasoning (`reasoning_content`) is persisted for multi-turn context but stripped from every browser response (`conversations/[id]` GET maps it out; `done` event sends content only).
- Limits are enforced server-side (60 messages/conversation, 100 conversations/workspace, 16k chars, 2 MB image, 600k response chars); the client mirrors some of them but the server is the authority.
- There is no `tailwind.config.js`; Tailwind v4 is wired through PostCSS and design tokens live in `src/app/globals.css` (`--mint` palette).
- Do not weaken gates to make them pass (no `@ts-ignore`, no disabling rules, no deleting tests). Fix root causes.
- Keep all commits on `main`.
- Operational debt: a private key was once committed at `docs/ssh-key.txt` (removed from tracking; still in git history — see `docs/CODE_REVIEW_REPORT.md`). Treat rotation as pending until the operator confirms it; never reintroduce key material.
- `scripts/` holds operational CLI scripts (`.mjs` with explicit `.ts` import extensions — Node type-stripping requires extensions and does not resolve `@/` aliases; `src/lib/retention.ts` and `src/db/seed.ts` therefore keep runtime imports down to `drizzle-orm` and receive tables from the caller).

---

### Initialize Database in Docker (idempotent) 
 
```bash 
  sudo docker compose up -d 
  # pg_isready -U chat_user -d chat_db → healthy at 1 
 
  DATABASE_URL="postgresql://chat_user:chat_secret@127.0.0.1:5433/chat_db" npm run db:migrate 
  # → Reading drizzle.config.ts 
  # → [✓] migrations applied successfully! 
 
  sudo docker exec new_chat_postgres psql -U chat_user -d chat_db -c "\dt" 
  # => chat_sessions | chat_user 
  # => conversations | chat_user 
 
  DATABASE_URL="..." npm run db:seed 
  # → {"operation":"db.seed","inserted":0}   # already seeded (sessions=4, convs=2 after prior E2E fixtures) 
  # second run → inserted:0 (idempotent) 
 
  # cold-start variant tested earlier (down -v → 0 relations → migrate → 2 relations) — proven 
```

### Commands for Next Cycle 
 
```bash 
  # normal dev (idempotent, no data loss) 
  sudo docker compose up -d 
  DATABASE_URL="postgresql://chat_user:chat_secret@127.0.0.1:5433/chat_db" npm run db:migrate 
  DATABASE_URL="..." npm run db:seed 
  npm run typecheck && npm run lint && npm test && npm run build 
  # restart background: 
  bg_kill bt-1 2>&1 | head   # or kill <pid> 
  bg_start --title "kimi-3002" --command 'DATABASE_URL="postgresql://chat_user:chat_secret@127.0.0.1:5433/chat_db" npx next start -p 3002' 
 
  # schema change: 
  # edit src/db/schema.ts → npm run db:generate → git add drizzle/ → npm run db:migrate 
 
  # cold-start proof (destroys volume): 
  # RESET=true sudo docker compose down -v && sudo docker compose up -d && npm run db:migrate && npm run db:seed 
``` 
 
### DB Init on Fresh Volume — Evidence 
 
```bash 
  sudo docker ps  # new_chat_postgres Up 2m (healthy) 0.0.0.0:5433->5432 
  sudo docker exec new_chat_postgres psql -c "\dt"  # before: 0 relations 
 
  DATABASE_URL="postgresql://chat_user:chat_secret@127.0.0.1:5433/chat_db" npm run db:migrate 
  # → Reading drizzle.config.ts 
  # → Using 'pg' driver 
  # → [✓] migrations applied successfully! 
 
  sudo docker exec new_chat_postgres psql -c "\dt" 
  # => chat_sessions | chat_user 
  # => conversations | chat_user 
 
  DATABASE_URL="..." npm run db:seed  # → {"operation":"db.seed","inserted":1} (Welcome to Kimi — seeded demo) 
  DATABASE_URL="..." npm run db:seed  # → {"operation":"db.seed","inserted":0} (idempotent) 
  DATABASE_URL="" npm run db:migrate  # → DATABASE_URL is required (fail-fast, not hang) 
``` 
 

### Gates & Restart 
 
```bash 
  npm run typecheck  # ✓ Types generated 
  npm run lint       # 0 problems 
  npm test           # 5/5 
  npm run build      # ✓ 6 routes (/, /_not-found, ƒ /api/chat, ƒ /api/conversations, ƒ /api/conversations/[id], ƒ /api/health) 
 
  # restart (preserve scandihaven 3000/3001, free only kimi 3002) 
  kill 3028466; ss -tlnp | grep 3002 → free 
  bg_start --title "kimi-3002" --command 'DATABASE_URL="postgresql://chat_user:chat_secret@127.0.0.1:5433/chat_db" npx next start -p 3002' 
  # → bt-1 [running] pid 3059382 · ✓ Ready in 188ms 
 
  curl -s http://localhost:3002/api/health               # {"ok":true} (1st poll) 
  curl -s -i http://localhost:3002/api/conversations 
  # → 200 · nosniff · DENY · Strict-Transport-Security: 63072000; includeSubDomains 
  # → CSP: frame-ancestors 'none'; base-uri 'self'; object-src 'none' 
  # → Set-Cookie: kimi_session=… HttpOnly; SameSite=strict 
  # → {"conversations":[],"configured":true} 
  curl -s http://localhost:3002/ | grep "Kimi — A little more possible"  # 200 
```  

### Next Run 
 
```bash 
  # normal (idempotent, no -v) 
  sudo docker compose up -d 
  # wait pg_isready -U chat_user -d chat_db → accepting 
  npm run db:migrate  # bare works via .env 
  npm run db:seed 
  npm run typecheck && npm run lint && npm test && npm run build 
  # restart background 
  bg_kill bt-1; bg_start --title "kimi-3002" --command 'DATABASE_URL="postgresql://chat_user:chat_secret@127.0.0.1:5433/chat_db" npx next start -p 3002' 
``` 

- Findings from the latest tiered audit and their status live in `docs/CODE_REVIEW_REPORT.md`; consult it before planning work in this repo.

---

$ npm install

up to date, audited 517 packages in 3s

232 packages are looking for funding
  run `npm fund` for details

4 moderate severity vulnerabilities

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
npm warn install-scripts 1 package had install scripts blocked because they are not covered by allowScripts:
npm warn install-scripts   unrs-resolver@1.12.2 (postinstall: node postinstall.js)
npm warn install-scripts
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
(venv) pete@pop-os:/Home1/project/new-chat-app
$ npm ci
npm warn deprecated @esbuild-kit/esm-loader@2.6.5: Merged into tsx: https://tsx.hirok.io
npm warn deprecated @esbuild-kit/core-utils@3.3.2: Merged into tsx: https://tsx.hirok.io
npm warn deprecated eslint@9.39.5: This version is no longer supported. Please see https://eslint.org/version-support for other options.

added 516 packages, and audited 517 packages in 12s

232 packages are looking for funding
  run `npm fund` for details

4 moderate severity vulnerabilities

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
npm warn install-scripts 1 package had install scripts blocked because they are not covered by allowScripts:
npm warn install-scripts   unrs-resolver@1.12.2 (postinstall: node postinstall.js)
npm warn install-scripts
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
(venv) pete@pop-os:/Home1/project/new-chat-app
$ npm run build
npm notice run build
npm notice run next build
▲ Next.js 16.3.4 (Turbopack)
- Environments: .env
✓ Running next.config.ts took 37ms

  Creating an optimized production build ...
✓ Compiled successfully in 8.7s
✓ Finished TypeScript in 6.2s    
✓ Collecting page data using 3 workers in 693ms    
✓ Generating static pages using 3 workers (4/4) in 328ms
✓ Finalizing page optimization in 5ms    

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/chat
├ ƒ /api/conversations
├ ƒ /api/conversations/[id]
└ ƒ /api/health


○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
