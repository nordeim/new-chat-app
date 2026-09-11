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
| Apply SQL migrations (production-safe) | `npm run db:migrate` (wrapper logs `hash/sessions/conversations` + curated `PostgreSQL not reachable` on failure) |
| Seed a fresh database (idempotent) | `npm run db:seed` (logs `inserted/reason/sessions`) |
| Migrate + seed in one (cold-start) | `npm run db:setup` (migrate + seed, single summary, curated errors) |
| Apply schema to dev database (prototyping) | `npx drizzle-kit push` |

Verification order: `npm run typecheck` → `npm run lint` → `npm test` → `npm run build`. The typecheck script runs `next typegen` before `tsc --noEmit`, so route-type generation can never be skipped.

## Environment

- Node.js ≥ 22 (unit tests rely on `--experimental-strip-types`), PostgreSQL required.
- `src/db/index.ts` throws at import time if `DATABASE_URL` is unset — every API route touches the database, so nothing runs without it.
- `NVIDIA_API_KEY` is server-only. Never use a `NEXT_PUBLIC_` variable for it. Missing key returns HTTP 503 with a user-facing message; this path is tested on purpose.
- `drizzle.config.ts` reads `DATABASE_URL` from the environment (via `dotenv/config`); it is the single source of truth — no hard-coded sandbox URL. For one-off pushes against another URL, use `npx drizzle-kit push --url="$DATABASE_URL"`.
- Playwright E2E tests require the production preview running (`npm run build && npm start`), a disposable `DATABASE_URL` (tests insert/delete fixtures), and no `NVIDIA_API_KEY` by design. `TEST_BASE_URL` overrides `http://localhost:3000`.

## Architecture map

- `src/app/api/chat/route.ts` — the core: origin check → session → zod validation → image magic-byte check → atomic session lease (one generation per workspace, 3 s spacing, 195 s expiry; 615 s for `max_tokens > 16,384`) → conversation upsert with duplicate-retry guard → NVIDIA fetch with SSE parse (timeout 175 s; 590 s for large outputs, `maxDuration 600`) → persistence of final answer only → SSE to browser.
- `src/app/api/conversations/` — list / search / read / rename / delete. The list endpoint accepts `?q=` (server-side ILIKE over title and JSONB message content, owner-filtered, wildcard-escaped). Every query filters by `owner`; delete uses a transaction with `FOR UPDATE` on the session row so it cannot race a running generation.
- `src/lib/origin.ts` — pure same-origin gate shared by every write endpoint: accepts the origin when it matches `Host` OR the first `x-forwarded-host` value (trusted-ingress convention); rejects `sec-fetch-site: cross-site`, malformed origins, and non-http(s) schemes. Kept free of Next/DB imports so the unit suite can run it anywhere.
- `src/lib/server.ts` — cookie session (`kimi_session`, 64-hex token; only the SHA-256 digest is stored as `owner`), `assertOrigin` (same-origin writes), bounded `readJson` (3 MB), `errorResponse` (structured logs without PII).
- `src/lib/retention.ts` — pure prune functions taking `{ db, tables, options }` (no relative runtime imports so the node type-stripping CLI can load them). `scripts/prune-expired.mjs` is the CLI wrapper (`npm run prune`).
- `src/db/seed.ts` + `scripts/seed.mjs` — idempotent local-dev seed (no PII, safe to re-run). Injected `{ db, tables }` so the CLI stays alias-free and type-strippable. CLI logs `{inserted, reason, sessions}` and a curated `PostgreSQL not reachable` on ECONNREFUSED.
- `scripts/migrate.mjs` + `scripts/db-setup.mjs` — wrappers for `db:migrate` / `db:setup`. Preflight `DATABASE_URL` + `select 1` with curated JSON errors; post-migrate they log `{hash, sessions, conversations}` / `{migrationsApplied, inserted}` so the fast no-op spinner (`[✓]`) is self-explanatory.
- `src/lib/validation.ts` — all zod schemas, shared by server and unit tests.
- `src/lib/sse.ts` — SSE parser handling LF/CRLF/CR separators, events split across network chunks, and multi-line data with incremental size limits; the per-event bound is a validated constructor argument (RangeError outside 1–8M safe integers): the provider path keeps the 1M default, the browser constructs 8M because the final `done` event can carry a ~1.2M-char answer JSON-escaped into one data line. Used by BOTH the API route and the browser client. Changes affect both sides.
- `src/components/chat-workspace.tsx` — the workspace shell (composer, dialogs, sidebar, streaming state machine). Client-side zod schemas validate every API and stream payload; malformed stream events are converted to curated copy before reaching the banner. `WorkspaceRequestError` marks intentional, user-facing copy — only it is shown verbatim; anything else renders transport-failure guidance. This boundary covers the send path, the open-conversation path, AND the rename/delete mutation toast (`mutateConversation`), so raw transport text (`Failed to fetch`) can never reach the UI. Server-search results are bound to the term that requested them (`{term, items, failed}`), so a failed search degrades to local titles behind a retryable notice instead of showing another query's results.
- `src/components/markdown-message.tsx` — memoized GFM + `rehype-highlight` renderer with a per-block copy control; completed messages skip re-parsing while a sibling streams. Its hljs theme and code-block styles live in `globals.css`.
- `src/components/image-lightbox.tsx` — Radix full-size image preview (focus trap, Escape, focus restore); opened from message images in `chat-workspace.tsx`.
- `src/lib/title.ts` — pure `deriveTitle(content)`: collapses whitespace runs (multi-line prompts → single-line titles; `\s+` intentionally covers Unicode whitespace) and enforces a dual cap — 70 code points (surrogate-safe) AND ≤100 UTF-16 units so `titleSchema` (which counts UTF-16 units) always accepts a derived title verbatim; the result is trimmed. Used by the chat route's insert path; unit-tested in `tests/core.test.mjs`.
- `src/lib/history.ts` — pure sidebar grouping (`Today/Yesterday/Previous 7 days/Older`) + relative timestamps; invalid timestamps bucket to Today.
- `src/lib/markdown.ts` — `getNodeText`, used by the code-copy control to extract plain text from React nodes.
- `src/lib/workspace-error.ts` — maps a `/api/health` probe result to load-failure copy (DB outage vs reload); `chat-workspace.tsx` calls it in the `refresh()` catch.
- `src/components/navigation-frame.tsx` — wraps the sidebar in a Radix dialog while the mobile drawer is open (focus containment, Escape, focus restore to the "Open navigation" control). The Radix backdrop is aria-hidden, so the drawer carries its own close button (`.sidebar-close`, visible only while open).
- `src/db/schema.ts` — Drizzle schema. `messages` is JSONB on `conversations`; cascade delete via session FK.

## Non-obvious rules

- `tsconfig.json` and `eslint.config.mjs` deliberately exclude `skills/`, `sample-build/`, and `docs/` — they are reference material uploaded into the workspace, not part of the app. Do not remove these excludes; the build type-checks everything matched by `**/*.ts`.
- `layout.tsx` imports `globals.css` first, then `workspace-polish.css` (the editorial mint layer adopted from sample-build: tokens override, position-only welcome animation — the old opacity fade transiently broke AA — and the bloom-mark emblem). Keep the import order; styles in the layer win over `globals.css` by load order, not specificity games.
- The error banner shows a message verbatim only when it is a `WorkspaceRequestError` (curated by design: server error events, the malformed-frame guard, `apiJson`/`parseOrReload` failures). Raw `Error`s from fetch rejection render "The connection was interrupted. Check your network and try again." (send) / "Could not open this conversation. Check your network and try again." (open). When adding curated copy, throw `WorkspaceRequestError`, not `Error`.
- After lint autofix, re-run formatting/order-sensitive gates before committing; restage files so the index matches the working tree.
- The send flow's `finally` defers `setBusy(false)` / `abortRef.current = null` by one macrotask (`setTimeout 0`). Swapping the stop button for the submit button inside the click's input task makes Chromium re-target the click's activation to the new default button and re-submit the form (a duplicate send). Keep the deferral; a regression test holds it (`stream-ui.spec.ts` stop-control case).
- Never assert against unscoped `getByRole("alert")` in Playwright tests: Next.js injects a global route announcer with `role="alert"` that is always present and empty. Target `.error-banner` instead.
- Client disconnects during streaming are expected teardown, not errors: Next.js 16 aborts `request.signal` with a named `ResponseAborted` error (an internal race can surface it as a default `AbortError`; Node body streams use `Error`/`"aborted"`/`ECONNRESET`). `src/lib/stream-abort.ts` classifies these into warn-level `{outcome:"aborted", abortBy}` logs — do not log expected aborts at error level, do not persist partial answers (the retry-dedupe guard depends on their absence), and do not treat the warn lines as defects.
- UI copy limits say "up to 2 MB" for images (the check allows exactly 2 MB) — keep client, server, and schema copy identical.
- Error messages returned to clients are user-facing copy (specific, actionable). Do not replace them with generic text or leak provider internals.
- Logs are structured JSON with `operation`, ids, and error types only — never message contents, cookies, or keys.
- Provider reasoning (`reasoning_content`) is persisted for multi-turn context but stripped from every browser response (`conversations/[id]` GET maps it out; `done` event sends content only).
- Limits are enforced server-side (60 messages/conversation, 100 conversations/workspace, 16k chars, 2 MB image, 1,200k response chars up to 256k tokens; ~16 MB history); the client mirrors some of them but the server is the authority.
- There is no `tailwind.config.js`; Tailwind v4 is wired through PostCSS and design tokens live in `src/app/globals.css` (`--mint` palette).
- Do not weaken gates to make them pass (no `@ts-ignore`, no disabling rules, no deleting tests). Fix root causes.
- Keep all commits on `main`.
- Operational debt: a private key was once committed at `docs/ssh-key.txt` (removed from tracking; still in git history — see `docs/CODE_REVIEW_REPORT.md`) and a provider key was once committed in `.env` (untracked in pass 3). Treat BOTH rotations as pending until the operator confirms them; never reintroduce key material or track `.env`. Status check 2026-09-11: the live deployment's `NVIDIA_API_KEY` is present (`configured: true`) but rejected by NVIDIA with 401/403 — every chat send surfaces the curated "NVIDIA rejected the server API key" banner. The key is dead, not missing; rotation is the operator action that restores live chat.
- Deployments behind TLS ingress must preserve the public `Host` or forward it as `x-forwarded-host` (Cloudflare/nginx do); otherwise the same-origin gate rejects browser writes with 403. README troubleshooting documents the failure mode.
- `scripts/` holds operational CLI scripts (`.mjs` with explicit `.ts` import extensions — Node type-stripping requires extensions and does not resolve `@/` aliases; `src/lib/retention.ts` and `src/db/seed.ts` therefore keep runtime imports down to `drizzle-orm` and receive tables from the caller).

---

- Findings from the latest tiered audit and their status live in `docs/CODE_REVIEW_REPORT.md`; consult it before planning work in this repo.

