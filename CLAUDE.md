---
IMPORTANT: File is read fresh for every conversation. Be brief and practical.
---

# Kimi Workspace (new-chat-app)

## Core Identity & Purpose

A production-grade chat workspace: streamed NVIDIA NIM responses (`moonshotai/kimi-k3` via the OpenAI-compatible endpoint), saved conversations with search/rename/delete/export, image-aware composer with a full-size lightbox, syntax-highlighted GFM answers with code-copy, date-grouped history, and a calm mint-accented UI. Conversations are isolated by a secure browser-session cookie; only a SHA-256 digest of the cookie token reaches the database. Maintained as a clean Next.js/PostgreSQL starter suitable for enterprise adoption work.

Stack: Next.js 16 App Router · React 19 · TypeScript (strict) · Tailwind v4 (CSS-first) · Drizzle ORM · PostgreSQL · zod v4 · Playwright + node:test.

## Foundational Principles

### Meticulous Approach (Six-Phase Workflow)

1. **ANALYZE** — read the real code, schemas, and configs in full; surface explicit, implicit, and ambiguous requirements; assess risk.
2. **PLAN** — produce a structured, sequential plan with acceptance criteria.
3. **VALIDATE** — confirm the plan against the codebase before implementing.
4. **IMPLEMENT** — modular, tested, documented increments (TDD: red → green → refactor).
5. **VERIFY** — run typecheck → lint → unit tests → build; use evidence, not claims.
6. **DELIVER** — complete handoff: what changed, what was verified, what remains.

### Project-Specific Principles

- **Server is the authority** — every limit, ownership check, and validation is enforced server-side; the client mirrors for UX only.
- **No silent failure** — user-facing error copy is specific and actionable; structured JSON logs carry operation/id/error-type, never message content or secrets.
- **Streaming integrity** — only complete provider answers are persisted; partial/failed streams surface explicit errors and stay retryable.
- **Session isolation** — every conversation query filters by `owner`; writes require a same-origin `Origin` header (matched against `Host` or the trusted ingress's `x-forwarded-host`).
- **Curated failure surfaces** — initial-load failures always show the reload guidance; streamed/API error copy comes from the server contract. Raw parse, network, or schema errors never reach the banner.

## Implementation Standards

### General Coding Practices

- Early returns; composition over inheritance; self-documenting names.
- TDD for new logic: failing test first, then minimal implementation.
- No `any` — use `unknown` plus narrowing. No `@ts-ignore`. No disabled rules/tests.
- Validate all external input with zod at the boundary (`src/lib/validation.ts` is the single home for schemas).
- One responsibility per module; parse provider data as typed structures, dispatch on explicit `type` fields.
- Client-side API payloads are untrusted: validate every API response with zod through the shared `apiJson`/`parseOrReload` helpers so degraded servers/proxies cannot leak raw errors into the UI.

### Language & Framework Guidelines

**TypeScript (strict mode)**
- `tsconfig` excludes `skills/`, `sample-build/`, `docs/` — reference material, not app code. Do not remove the excludes.
- Avoid explicit return types unless inference fails.

**React 19 (client component)**
- The workspace is composed of `chat-workspace.tsx` (shell: composer, dialogs, sidebar) plus extracted pieces (`markdown-message.tsx`, `image-lightbox.tsx`, `navigation-frame.tsx`): handle loading/error/empty/success states explicitly; disable controls during async work; keep derived state out of `useState`.
- Effects must not call `setState` synchronously (lint rule `react-hooks/set-state-in-effect` is an error here).
- The send `finally` defers the busy flip by one macrotask (`setTimeout 0`): swapping the stop button for the submit button inside the click's input task makes Chromium re-target the click's activation and re-submit the form. Do not "simplify" this back to a synchronous flip.
- Only `WorkspaceRequestError` messages are shown verbatim in the banner. New curated copy throws `WorkspaceRequestError`; raw `Error`s from transport failures render the network-failure guidance instead. The browser constructs `new SSEParser(8_000_000)` — the final `done` event can carry a ~1.2M-char escaped answer; never shrink it back to the default.

**Next.js 16 (App Router)**
- Route handlers under `src/app/api/*` with `export const runtime = "nodejs"` where streaming is used (`maxDuration = 600` on `/api/chat`; provider timeout 175s, 590s for long outputs).
- `npm run typecheck` runs `next typegen` before `tsc --noEmit`; use it after every route change.
- Security headers and CSP in `next.config.ts`; keep them intact (`poweredByHeader: false` is deliberate).
- Next.js injects a global route announcer with `role="alert"` — never assert against `getByRole("alert")` unscoped in tests; target `.error-banner`.

**Tailwind v4 (CSS-first)**
- No `tailwind.config.js`; tokens and component styles live in `src/app/globals.css` (`--mint` palette), layered by `src/app/workspace-polish.css` (imported after it in `layout.tsx` — the editorial mint layer; keep the order). Reuse tokens; do not hardcode colors.

## Development Workflow

### Environment Setup

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

### Build Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server |
| `npm run build` | Production build (includes type checking) |
| `npm start` | Serve the production build |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` (route types always fresh) |
| `npm run lint` | ESLint (flat config, next core-web-vitals) |
| `npm test` | Unit tests (node:test + strip-types) |
| `npm run test:e2e` | Playwright suite (needs built app + test database) |
| `npm run db:generate` | Generate SQL migration from `src/db/schema.ts` → `drizzle/*.sql` + `drizzle/meta` (commit both) |
| `npm run db:migrate` | Apply migrations (journal-driven, idempotent; logs `hash/sessions`; `[✓]` appears for both fresh and no-op — check logged hash) |
| `npm run db:seed` | Seed demo workspace on fresh DB (`{inserted:1, reason:"seeded demo workspace"}` → `{inserted:0, reason:"already seeded"}` on re-run) |
| `npm run db:setup` | `migrate + seed` in one (logs `{migrationsApplied, inserted, hash, sessions}`; `1/1` fresh → `0/0` warm; curated `PostgreSQL not reachable` preflight) |
| `npx drizzle-kit push` | Push schema directly (prototyping only — not production-safe) |

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

## Testing Strategy

### Test Pyramid

- Unit (`tests/core.test.mjs`, `tests/origin.test.mjs`, `tests/stream-limit.test.mjs`; 31 total): zod schemas, SSE parser edge cases (LF/CRLF/CR, split chunks, size limits, the configurable browser/provider bounds), the pure same-origin gate, sidebar history grouping + relative time, markdown node-text extraction, and load-failure copy selection — fast, no services.
- **API/integration** (`tests/workspace.spec.ts`): session isolation, ownership, origin enforcement, cookie flags, `?q=` search, retention pruning — Playwright request context + Drizzle fixtures.
- **E2E/UI** (`tests/workspace.spec.ts`, `tests/stream-ui.spec.ts`, `tests/recovery.spec.ts`, `tests/network-recovery.spec.ts`; 29 local total): user journeys, WCAG AA via axe (welcome, dialogs, **and the error state**), streamed-answer rendering through transport fixtures (no live provider needed) — including stop-control abort, malformed-frame copy, code-copy, lightbox, skip link, character counter, DB-outage copy, failed-search fallback + retry, failed-navigation send-destination guard, and network-failure copy.
- **Live deployment** (`tests/live-site.spec.ts`): env-gated via `LIVE_SITE_URL`; validates a real deployment (headers, Secure cookie, exact-403 cross-origin writes, API contract, session isolation, and one provider round-trip when configured — verified into persisted storage via the read API, with the test deleting only its own conversation; its error race is scoped to `.error-banner` because of the route announcer above).

### Test Commands

```bash
npm test                       # unit
npm run test:e2e               # Playwright (start the production preview first)
npx playwright test tests/stream-ui.spec.ts   # single suite
LIVE_SITE_URL=https://host npx playwright test tests/live-site.spec.ts  # live deployment
npm run prune -- --idle-days 30                # retention (ops)
```

E2E prerequisites: `npm run build && npm start`, disposable `DATABASE_URL` (fixtures are inserted/deleted), **no** `NVIDIA_API_KEY` (missing-key UX is part of the spec), `TEST_BASE_URL` for non-default origins.

Audit history: the severity-ranked review at `docs/CODE_REVIEW_REPORT.md` records what was checked, what was fixed, and open backlog items — read it before planning changes.

## Code Quality Standards

- Gate order: `npm run typecheck` → `npm run lint` → `npm test` → `npm run build`. If DB touched: `npm run db:setup` → `curl /api/health` → (if UI touched) `npm run test:e2e` (build + start on `3004` if `3000` busy).
- Never weaken a gate to pass it (no loosening types, no removing tests, no disabling rules) — fix the underlying issue.
- Structured logs only: `console.error(JSON.stringify({ operation, ids, errorType }))`.

## Git & Version Control

- All work lands on `main` (no feature branches in this repo's workflow).
- Atomic commits with descriptive messages explaining *why*; run the full gate order before each commit.
- Never commit secrets; `.env*` is ignored. If a secret lands in history, rotate it.

## Error Handling & Debugging

- `ApiError(status, message)` + `errorResponse()` is the single error funnel for API routes; user-facing copy is specific ("what happened, what to do").
- `errorResponse` logs `operation` + `requestId` + error type; surface the `requestId` in the 500 body for support correlation.
- **Abort taxonomy (don't "fix" these):** when the browser disconnects mid-stream (Stop button, refresh, tab close, navigating away, network drop), Next.js 16 aborts `request.signal` with a named `ResponseAborted` error, which propagates through the route's `AbortSignal.any([...])` to the upstream fetch. The same disconnect can surface as a default `AbortError` (pipe-cancel race) or as Node's body-stream signature (`Error`/`"aborted"`/`ECONNRESET`) on the create path; the route's own timeout surfaces as `TimeoutError`. `src/lib/stream-abort.ts` classifies these — aborts log at **warn** level with `outcome:"aborted"`, `abortBy`, and (streaming) `partialChars`; only genuine failures log at error level. Seeing `{"outcome":"aborted","abortBy":"client-disconnect"}` is expected client teardown, not a bug.
- On abort, partial assistant output is intentionally **not** persisted: the retry-dedupe guard (last message = same user turn) depends on it, so "try again" re-streams cleanly instead of duplicating turns.
- Reproduce before fixing; one root-cause fix over many symptom patches; add a regression test for every bug fix.

## Communication & Documentation

- Update `README.md` / `AGENTS.md` / `CLAUDE.md` whenever behavior, setup steps, or contracts change.
- Explain *why* in comments only where it prevents future misunderstanding.
- State verification evidence ("ran X, observed Y"); label anything not executed as such.

## Project-Specific Standards

### Architecture

Request path: browser → `/api/chat` → origin + session + lease → conversation upsert (retry-safe) → NVIDIA SSE → parse/validate → persist final answer → SSE events (`meta`, `thinking`, `delta`, `done`, `error`) → browser. The SSE parser (`src/lib/sse.ts`) is shared by server and client — changes affect both.

### API Design

| Endpoint | Method | Notes |
|----------|--------|-------|
| `/api/chat` | POST | SSE stream; origin-checked (proxy-aware); session lease (429 on conflict) |
| `/api/conversations` | GET | Sets session cookie; returns list + `configured` flag; optional `?q=` server-side search over titles and message content |
| `/api/conversations/[id]` | GET/PATCH/DELETE | Ownership enforced; rename validates 1–100 chars; delete is transactional and refuses while a response is running |
| `/api/health` | GET | DB connectivity only; does not validate the provider key |

### Database / Data Layer

- **Source of truth:** `drizzle.config.ts` reads `DATABASE_URL` via `dotenv/config` (`verbose:true strict:true`); no hard-coded URL. `drizzle` schema `drizzle` / table `__drizzle_migrations` stores hash `d5d43cb…`; SQL `drizzle/0000_flimsy_sage.sql`; extensions `pgcrypto` + `pg_trgm` via `infrastructure/postgres/init/00-create-extensions.sql` (once per volume).
- **Pool:** `src/db/index.ts` `pg.Pool` cached on `globalThis` in dev, `drizzle(pool)`; throws at import if `DATABASE_URL` missing — every API route fails fast.
- **Lifecycle:** `npm run db:generate` (edit schema → generate) → `npm run db:migrate` (wrapper: preflight `select 1` → `spawnSync drizzle-kit migrate` → post `{hash,sessions}`) → `npm run db:seed` (idempotent, `{inserted,reason,sessions}`) → `npm run db:setup` (migrate+seed, `{migrationsApplied,inserted}`). All via `node --experimental-strip-types scripts/*.mjs` (explicit `.ts` imports, injected `{db,tables}`).
- **Idempotency:** `migrate` no-op when hash matches (same `[✓]` — check logged hash); `seed` `inserted:0` when `count>0` means "already seeded", not failure.
- **Queries:** Parameterized Drizzle only; never string-concatenate SQL. See `scripts/migrate.mjs`/`db-setup.mjs` for curated `PostgreSQL not reachable at DATABASE_URL — run docker compose up -d` preflight pattern.

### Environment Variables

| Variable | Purpose | Notes |
|----------|---------|-------|
| `DATABASE_URL` | PostgreSQL connection string | Required; app throws at import without it; local `postgresql://chat_user:chat_secret@127.0.0.1:5433/chat_db` (Docker `5433:5432`); wrappers preflight `select 1` → curated JSON on `ECONNREFUSED` |
| `NVIDIA_API_KEY` | Provider key (server-only) | Optional locally; missing key → 503 with guidance |
| `TEST_BASE_URL` | Playwright target origin | Optional; default `http://localhost:3000` |
| `LIVE_SITE_URL` | Live-deployment E2E target | Optional; suite skips when unset |

## Anti-Patterns to Avoid

- Over-engineering: no speculative config, feature flags, or abstractions beyond the request.
- Generic error text replacing the curated user-facing copy.
- Persisting partial provider answers or fabricating fallback responses.
- Logging message contents, cookies, or the API key.
- Editing files under `skills/`, `sample-build/`, or `docs/` as if they were app code.
