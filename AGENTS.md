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
| Apply schema to dev database | `npx drizzle-kit push` |

Verification order: `npm run typecheck` → `npm run lint` → `npm test` → `npm run build`. The typecheck script runs `next typegen` before `tsc --noEmit`, so route-type generation can never be skipped.

## Environment

- Node.js ≥ 22 (unit tests rely on `--experimental-strip-types`), PostgreSQL required.
- `src/db/index.ts` throws at import time if `DATABASE_URL` is unset — every API route touches the database, so nothing runs without it.
- `NVIDIA_API_KEY` is server-only. Never use a `NEXT_PUBLIC_` variable for it. Missing key returns HTTP 503 with a user-facing message; this path is tested on purpose.
- `drizzle.config.json` targets a local sandbox database (`127.0.0.1:5432/app_db`); point your own tooling at your environment's URL for real deployments.
- Playwright E2E tests require the production preview running (`npm run build && npm start`), a disposable `DATABASE_URL` (tests insert/delete fixtures), and no `NVIDIA_API_KEY` by design. `TEST_BASE_URL` overrides `http://localhost:3000`.

## Architecture map

- `src/app/api/chat/route.ts` — the core: origin check → session → zod validation → image magic-byte check → atomic session lease (one generation per workspace, 3 s spacing, 195 s expiry) → conversation upsert with duplicate-retry guard → NVIDIA fetch with SSE parse → persistence of final answer only → SSE to browser.
- `src/app/api/conversations/` — list / search / read / rename / delete. The list endpoint accepts `?q=` (server-side ILIKE over title and JSONB message content, owner-filtered, wildcard-escaped). Every query filters by `owner`; delete uses a transaction with `FOR UPDATE` on the session row so it cannot race a running generation.
- `src/lib/server.ts` — cookie session (`kimi_session`, 64-hex token; only the SHA-256 digest is stored as `owner`), `assertOrigin` (same-origin writes), bounded `readJson` (3 MB), `errorResponse` (structured logs without PII).
- `src/lib/retention.ts` — pure prune functions taking `{ db, tables, options }` (no relative runtime imports so the node type-stripping CLI can load them). `scripts/prune-expired.mjs` is the CLI wrapper (`npm run prune`).
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
- `scripts/` holds operational CLI scripts (`.mjs` with explicit `.ts` import extensions — Node type-stripping requires extensions and does not resolve `@/` aliases; `src/lib/retention.ts` therefore keeps its runtime imports down to `drizzle-orm` and receives tables from the caller).
- Findings from the latest tiered audit and their status live in `docs/CODE_REVIEW_REPORT.md`; consult it before planning work in this repo.

---

$ sudo docker compose -f docker-compose.yml up -d
[+] up 3/3
 ✔ Network new-chat-app_chat_net Created                                                                                                                                                                       0.5s
 ✔ Volume new-chat-app_chat_data Created                                                                                                                                                                       0.1s
 ✔ Container new_chat_postgres   Started                                                                                                                                                                       1.7s

$ sudo docker ps
CONTAINER ID   IMAGE                COMMAND                  CREATED         STATUS                            PORTS                                                   NAMES
03dced90c2ba   postgres:17-alpine   "docker-entrypoint.s…"   16 seconds ago   Up 15 seconds (healthy)   5432/tcp, 0.0.0.0:5433->5433/tcp, [::]:5433->5433/tcp   new_chat_postgres

$ npm run build
npm notice run build
npm notice run next build
▲ Next.js 16.3.4 (Turbopack)
- Environments: .env
✓ Running next.config.ts took 45ms

  Creating an optimized production build ...
✓ Compiled successfully in 8.7s
✓ Finished TypeScript in 5.1s
✓ Collecting page data using 3 workers in 680ms
✓ Generating static pages using 3 workers (4/4) in 300ms
✓ Finalizing page optimization in 7ms

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/chat
├ ƒ /api/conversations
├ ƒ /api/conversations/[id]
└ ƒ /api/health


○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
