# Kimi Workspace — Deep Review & Alignment Validation Plan

> Meticulous six-phase approach: ANALYZE → PLAN → VALIDATE → IMPLEMENT → VERIFY → DELIVER
> Scope: `AGENTS.md` · `CLAUDE.md` · `README.md` vs. codebase (src, tests, configs, CI, drizzle, scripts, live deployment)
> Date: 2026-09-10 · Branch: `main` @ `eb654aa`

---

## Goal

Confirm that every claim, contract, and constraint stated in `AGENTS.md`, `CLAUDE.md`, and `README.md` is faithfully implemented in the codebase, surface any drift, and certify current project status with evidence (not prose).

---

## Phase 1 — Deep Understanding Synthesized (DONE)

### 1.1 Project Identity (triple-checked across all three docs)

- **What:** Next.js 16 App Router + React 19 + Tailwind v4 (CSS-first) + TypeScript strict · PostgreSQL + Drizzle ORM · zod v4 · NVIDIA NIM `moonshotai/kimi-k3` via OpenAI-compatible SSE.
- **Why it exists:** Most chat starters are single-prompt, no persistence, no streaming ergonomics, no visitor isolation. Kimi pairs server-proxied inference with PG persistence, session-isolated history, and calm mint UI.
- **Core invariants (repeated verbatim in all docs):** server is authority; no silent failure (curated user copy + structured logs); streaming integrity (only final answers persisted); session isolation (`owner` = SHA-256 of `kimi_session`); curated failure surfaces.

### 1.2 Architecture Map (docs → code mapping)

| Doc claim | Code location | Verified behavior |
|-----------|---------------|-------------------|
| `src/app/api/chat/route.ts` — origin→session→zod→magic-byte→lease→upsert→NVIDIA SSE→persist final only→SSE | `src/app/api/chat/route.ts` 180 lines | Atomic lease `UPDATE … WHERE busyUntil < now() AND lastRequest < now-3s RETURNING`, 195s expiry, duplicate-retry guard (`last.role===user && content===input`), magic-byte PNG/JPEG/WebP + 2MB, provider timeout 175s, maxDuration 180, only `done` persists |
| `src/app/api/conversations/*` — list/search/read/rename/delete, owner-filtered, `?q=` ILIKE | `src/app/api/conversations/route.ts` + `[id]/route.ts` | `searchPattern()` escapes `\%_`, `ilike(title) OR jsonb_array_elements(messages)->>'content' ILIKE`, every query `eq(owner)`, delete uses `FOR UPDATE` on session + `busyUntil < now`, rename 1–100 via `titleSchema` |
| `src/lib/origin.ts` — pure same-origin gate | `src/lib/origin.ts` | `isSameOriginRequest(origin,host,forwardedHost,secFetchSite)` — accepts `Host` OR first `x-forwarded-host`, rejects `cross-site`, malformed, non-http(s); unit-testable pure function |
| `src/lib/server.ts` — cookie session, assertOrigin, bounded readJson, errorResponse | `src/lib/server.ts` | `kimi_session` 64-hex, SHA-256 digest stored, `ensureSession` onConflictDoNothing, `readJson` 3MB stream with 413, `errorResponse` ApiError vs 500+requestId+structured log (no PII) |
| `src/lib/retention.ts` + `scripts/prune-expired.mjs` | `src/lib/retention.ts` | Pure functions taking `{db,tables,options}`, `pruneIdleSessions(idleDays)` cascade via FK, `pruneStaleConversations(olderThanDays)` isolated |
| `src/lib/validation.ts` — single zod home | `src/lib/validation.ts` | `chatInputSchema` 16k, image 2.8M regex, settings strict, `providerChunkSchema` with `reasoning_content` |
| `src/lib/sse.ts` — shared parser | `src/lib/sse.ts` | LF/CRLF/CR separators, split-CRLF across chunks, `data:` with exactly-one-space, multiline `data` join `\n`, incremental 1M char limits for line+event |
| `src/components/chat-workspace.tsx` — single client component ~1500 lines | `src/components/chat-workspace.tsx` | `summarySchema/messageSchema/streamEventSchema` zod, `apiJson`+`parseOrReload` boundary validation, search debounce 250ms, lease-aware retry, `reasoning` stripped from display |
| `src/components/navigation-frame.tsx` — Radix dialog mobile drawer | `src/components/navigation-frame.tsx` | When `open` renders `Dialog.Root` with focus containment, Escape close, `onCloseAutoFocus` restores to `[aria-label="Open navigation"]`, backdrop aria-hidden so `.sidebar-close` lives inside |
| `src/db/schema.ts` — Drizzle JSONB + cascade | `src/db/schema.ts` | `chat_sessions(id text PK)`, `conversations(id uuid PK, owner→sessions.id cascade, messages jsonb ChatMessage[], title, updatedAt)` + owner+updatedAt index |

### 1.3 Non-Obvious Rules Synthesized

- `tsconfig.json` + `eslint.config.mjs` exclude `skills/`, `sample-build/`, `docs/` — reference material, never app code.
- After lint autofix, re-run all gates and restage before commit.
- Error copy is curated and actionable; never generic, never leaks provider internals.
- Logs are `{operation, ids, errorType}` only.
- `reasoning_content` persisted for multi-turn context, stripped from every browser payload (`GET /api/conversations/[id]` maps it out, `done` sends content only).
- Limits server-authoritative: 60 msgs/conversation, 100 conversations/workspace, 16k chars, 2MB image, 600k response chars; client mirrors for UX.
- No `tailwind.config.js`; tokens in `src/app/globals.css` (`--mint` palette).
- Never weaken gates with `@ts-ignore` / disabled rules / deleted tests.
- Commits stay on `main`; operational debt (SSH key in git history + former `.env` with `nvapi-` key) — both rotations pending operator confirmation, never reintroduce.
- TLS ingress must preserve public `Host` or forward `x-forwarded-host`; otherwise origin gate 403s.

### 1.4 Commands & Verification Order (all docs agree)

`npm ci` → `npm run typecheck` (`next typegen` + `tsc --noEmit`) → `npm run lint` → `npm test` (`node --experimental-strip-types --test tests/*.test.mjs`) → `npm run build`. E2E `npm run test:e2e` needs `npm run build && npm start` + disposable `DATABASE_URL`, no `NVIDIA_API_KEY`. `TEST_BASE_URL` overrides `localhost:3000`. `LIVE_SITE_URL` gates `tests/live-site.spec.ts`.

---

## Phase 2 — Validation Plan (Alignment Checks)

Each check is an independently verifiable task: file/line inspected + command run + expected observable. Phase X (gates) is intentionally LAST.

### Dimension A — Doc-to-Code Contract Alignment

- [ ] **A1: Architecture map line-by-line audit** → Open each file listed in AGENTS §Architecture map and confirm the one-line summary matches code: `src/app/api/chat/route.ts`, `src/app/api/conversations/**`, `src/lib/origin.ts`, `src/lib/server.ts`, `src/lib/retention.ts`, `src/lib/validation.ts`, `src/lib/sse.ts`, `src/components/chat-workspace.tsx`, `src/components/navigation-frame.tsx`, `src/db/schema.ts`. Verify: no missing file, no renamed export, no extra responsibility. *Done when: checklist ticked in PR description.*
- [ ] **A2: Limits table parity** → Search `src/app/api/chat/route.ts` for `16000`, `60`, `8_000_000`, `600_000`, `100`, `195_000`, `175_000`, `3000`; `src/lib/validation.ts` for `max(16000)`, `max(100)`, `2_800_000`; `src/lib/server.ts` for `3_000_000`. Cross-reference README §Data and security boundaries limits table. *Verify: `rg -n "16000|600_?000|195_000|busyUntil" src/` matches doc table exactly.*
- [ ] **A3: Error copy & log hygiene** → `rg -n "console\.(log|error)|ApiError|errorResponse" src/` — confirm every API route uses `errorResponse`, every log is `JSON.stringify({operation,…})` with no `message.content`, `cookie`, or `NVIDIA_API_KEY`. Spot-check 5 user-facing messages (missing key 503, lease 429, origin 403, invalid JSON 400, provider 502) for curated actionable copy. *Verify: no `console.log`, no `NEXT_PUBLIC_` for key.*

### Dimension B — Security & Isolation

- [ ] **B1: Session isolation proof** → `rg -n "eq\(.*owner" src/` — every `conversations` query includes `eq(conversations.owner, owner)` or `condition` built from `identity()`; `sessionId()` regex `^[a-f0-9]{64}$` + SHA-256; cookie flags `httpOnly:true, sameSite:strict, secure` conditional on `https` or `x-forwarded-proto`. *Verify: Playwright test `conversation CRUD enforces session isolation` still passes.*
- [ ] **B2: Same-origin gate completeness** → Unit suite `tests/origin.test.mjs` (7 tests): direct match, proxied `x-forwarded-host`, chained forwarded-host, http/https vs ftp/javascript, cross-site, missing/malformed/null, mismatch. Plus API regression in `tests/workspace.spec.ts:same-origin writes pass through trusted proxies`. *Verify: `npm test` shows 7/7 origin tests, `npx playwright test -g "x-forwarded-host"` green.*
- [ ] **B3: Secret hygiene** → `git ls-files | xargs git check-ignore` must show `.env` untracked-effective; `git grep -IE 'nvapi-|BEGIN.*PRIVATE KEY'` over `src tests scripts drizzle` and root configs returns nothing; CI secret-scan step present in `.github/workflows/ci.yml`. *Verify: `git ls-files` does not list `.env`; secret-scan would fail if key reintroduced.*

### Dimension C — Streaming Integrity

- [ ] **C1: SSE parser parity** → `src/lib/sse.ts` handles LF/CRLF/CR, split CRLF across `push()` calls, exactly-one-space `data:` handling, `finish()` emits `[DONE]`, incremental limits (1M). Shared by server (`route.ts` consume) and client (`chat-workspace.tsx` consume). *Verify: `tests/core.test.mjs` 5 SSE/validation tests pass, including lone-CR and oversized-event cases.*
- [ ] **C2: Persistence discipline** → In `src/app/api/chat/route.ts`, only the `completed && assistant.content` path does `db.update(conversations).set({messages:[...saved.messages, assistant]})`; error/edge paths send `type:error` and do NOT persist. Duplicate-retry guard prevents double user turn. *Verify: read route lines 60–180 and confirm `persist final answer only` comment still reflected in code paths.*

### Dimension D — Data Layer & Migrations

- [ ] **D1: Schema ↔ migration ↔ seed consistency** → `src/db/schema.ts` fields match `drizzle/0000_flimsy_sage.sql` (sessions PK text, conversations FK cascade, `conversations_owner_updated_idx`), `drizzle/meta/_journal.json` journal intact, `src/db/seed.ts` idempotent (insert+onConflictDoNothing), `drizzle.config.ts` reads `DATABASE_URL` via `dotenv/config` with no hard-coded URL. *Verify: `npx drizzle-kit check` / `npm run db:generate` produces no diff when schema unchanged.*

### Dimension E — Client UI & Accessibility

- [ ] **E1: Chat-workspace state hygiene** → `src/components/chat-workspace.tsx`: validates all API/stream payloads via zod (`apiJson`, `parseOrReload`, `streamEventSchema`), handles loading/error/empty/success, disables controls while `busy`, `queueMicrotask` avoids `set-state-in-effect`, search debounces 250ms with abort controller, thinking indicator separate from content deltas. *Verify: manual read of 1572-line file against `CLAUDE.md` UI standards.*
- [ ] **E2: Mobile drawer a11y** → `src/components/navigation-frame.tsx` wraps sidebar in Radix dialog; backdrop is aria-hidden so `.sidebar-close` exists; Escape + focus restore tested. *Verify: Playwright `mobile navigation closes on Escape and restores focus` passes; axe checks in `workspace.spec.ts` include dialog+error state.*

### Dimension F — API & Deployment Contracts

- [ ] **F1: Route contracts** → `curl` local prod build: `GET /api/health` → `{"ok":true}` (DB probe, no provider key); `GET /api/conversations` sets `kimi_session` HttpOnly Strict; `POST /api/chat` without `Origin` → 403; with `Origin: null` → 403; cross-site → 403; valid same-origin but empty content → 400 (validates gate ordering); missing `NVIDIA_API_KEY` → 503 curated copy. *Verify: `scripts/prune-expired.mjs` `--help` behavior and retention log line JSON shape.*
- [ ] **F2: Headers & CSP** → `next.config.ts` headers: `nosniff`, `DENY`, `HSTS max-age=63072000; includeSubDomains`, `Referrer-Policy`, `Permissions-Policy`, `CSP frame-ancestors 'none'; base-uri 'self'; object-src 'none'`, plus route-level `Cache-Control: no-store` on data APIs and `X-Accel-Buffering: no` on chat stream. *Verify: `curl -sI http://localhost:3000/api/conversations` shows header set.*

### Dimension G — Documentation Currency

- [ ] **G1: Tri-doc consistency** → Diff claims across `AGENTS.md` §Architecture map vs `CLAUDE.md` §Architecture vs `README.md` §File hierarchy + §Architecture table + §API reference + §Project status recent changes — all must name same files and same semantics after pass-3 remediations (origin extraction, Radix frame, incremental SST parser, proxy-aware check). *Verify: no file mentioned in one doc is missing in code; `docs/CODE_REVIEW_REPORT.md` listed remediations appear in git log.*
- [ ] **G2: Troubleshooting coverage** → README §Troubleshooting rows map to code errors: `DATABASE_URL is required` (db/index.ts throw), health 500 (health route), Connect NVIDIA (chat route 503), 429 lease, 403 x-forwarded-host. *Verify: each row's suggested fix actually resolves the error when reproduced.*

### Dimension H — Verification Gates (ALWAYS LAST)

- [x] **H1: Type safety** → `npm run typecheck` (`next typegen` before `tsc --noEmit`, strict, zero `any`/`@ts-ignore`) must pass. *Result 2026-09-10: ✅ `✓ Types generated successfully`, exit 0.*
- [x] **H2: Lint** → `npm run lint` (flat config + next core-web-vitals, `skills/ sample-build/ docs/` excluded) must be 0 problems. *Result: ✅ 0 problems, exit 0.*
- [x] **H3: Unit tests** → `npm test` (node:test + strip-types) must be 15/15 (5 validation + 3 SSE edge + 7 origin). *Result: ✅ 15/15 pass, 0 fail (origin 7 + SSE/validation 8), duration ~309ms.*
- [x] **H4: Production build** → `npm run build` must compile 6 routes with no warnings. *Result: ✅ Compiled in 2.8s, TypeScript 5.6s, 6 routes (/, /_not-found, /api/chat, /api/conversations, /api/conversations/[id], /api/health).*
- [ ] **H5: Local E2E + WCAG** → `npx playwright test tests/workspace.spec.ts tests/stream-ui.spec.ts` against prod build + disposable `DATABASE_URL` (no `NVIDIA_API_KEY`) must be 16/16, including proxied-origin + mobile-nav Escape + axe welcome/dialog/error. *Expected: ✅ 16/16.*
- [ ] **H6: Live-site probe (optional, needs LIVE_SITE_URL)** → `LIVE_SITE_URL=https://kimi-chat.jesspete.shop npx playwright test tests/live-site.spec.ts` plus `curl /api/health` and header inspection. *Expected once redeployed: 12/12; pre-redeploy the proxy fix still exposes 403 streaming failure by design.*

---

## Current Project Status Snapshot (evidence from this review)

| Area | Status | Evidence |
|------|--------|----------|
| **Git** | `main` up to date with `origin/main` @ `eb654aa` | `git log --oneline -7` shows pass-3 chain: secret untrack → x-forwarded-host fix → SSE parser → Radix drawer → regression tests → doc alignment |
| **Typecheck/lint/build gates** | Expected green (not yet re-run in this plan phase) | `tsconfig.json` excludes non-app dirs, `eslint.config.mjs` flat + next core-web-vitals, `next.config.ts` headers+HSTS intact |
| **Unit tests** | 15 tests defined (origin 7 + core 8) | `tests/origin.test.mjs` pure `isSameOriginRequest`, `tests/core.test.mjs` SSE+v alidation |
| **E2E tests** | 16 Playwright tests (workspace) + stream-ui + live-site (gated) | `tests/workspace.spec.ts` covers isolation, origin, search, retention, WCAG, mobile Escape |
| **DB layer** | Single migration `0000_flimsy_sage.sql`, PG 14+ via `pg.Pool` cached on `globalThis` in dev | `drizzle.config.ts` reads `DATABASE_URL`, `scripts/*` use explicit `.ts` extensions, no `@/` aliases |
| **Secrets** | ⚠️ **DOC-CODE DRIFT FOUND:** `.env` is still tracked at `HEAD` (`git ls-tree -r HEAD -- .env` → blob `c1b6596`) despite `dc1c664` claiming `git rm --cached .env`. Current key `nvapi-vn-hb…` is tracked and matches CI secret-scan pattern (`nvapi-[A-Za-z0-9_-]{20,}` → `git grep` hits `.env`). `.gitignore` lists `.env` but has no effect on tracked files. CI would fail on next push if scan includes `.env`. | **P0 fix required:** `git rm --cached .env` (keep file locally), commit, rotate the key again, do NOT re-add. Verify `git ls-files` no longer lists `.env` and `git check-ignore -v .env` shows ignored. |
| **Docs vs code drift** | **None material** after pass-3 docs alignment at `12409ae` + `eb654aa` | AGENTS architecture map, README file hierarchy, CLAUDE principles all reflect extracted `origin.ts`, `navigation-frame.tsx`, incremental parser |
| **Open operational items** | Redeploy required for H1 proxy fix to take effect live; weekly `npm run prune` cron unscheduled; lease-429 automated coverage backlog | `docs/CODE_REVIEW_REPORT.md` I1/I2/I6 |

---

## Risks & Mitigations

- **Ingress header trust:** `x-forwarded-host` is only trusted when the ingress is operator-controlled (Cloudflare/nginx). Mitigated by docs warning + `sec-fetch-site: cross-site` still rejected even with a spoofed forwarded-host.
- **History-carried secrets:** `.env` removal from tracking does not erase `7afe083` in history; same for `docs/ssh-key.txt`. Mitigation is credential rotation, not history rewrite without operator sign-off.
- **Concurrent 100-conversation cap:** count-then-insert can transiently exceed by 1 under race; accepted (self-inflicted, bounded, retention-corrects) — documented as I1.

---

## Done When

- [ ] Every row in Dimension A–G is ticked with a cited file/line or command output — no doc claim left unverified.
- [ ] Dimension H gates all show ✅ with pasted command outputs (typecheck, lint, test, build, E2E).
- [ ] No doc change required; or any drift is captured as a patch to `AGENTS.md`/`CLAUDE.md`/`README.md` and re-verified.
- [ ] Live deployment status is explicitly stated (deployed build hash vs `eb654aa`, `/api/health` result, header snapshot).
- [ ] This plan file is marked `[x]` per task as evidence accrues, and a one-page handoff summary is produced.

---

## Live Validation Evidence (executed 2026-09-10 during planning)

| Gate | Command | Output (trimmed) | Verdict |
|------|---------|------------------|---------|
| Typecheck | `npm run typecheck` | `Generating route types… ✓ Types generated successfully` | ✅ |
| Lint | `npm run lint` | `eslint .` → 0 problems | ✅ |
| Unit | `npm test` | `15 pass, 0 fail` — includes `origin.test.mjs` 7 + `core.test.mjs` 8 | ✅ |
| Build | `npm run build` | `Compiled successfully in 2.8s`, 6 routes (`/`, `/_not-found`, `/api/chat`, `/api/conversations`, `/api/conversations/[id]`, `/api/health`) | ✅ |
| Secret scan | `git grep -lIE 'nvapi-…' -- . ':!package-lock.json'` | Hits `.env` (tracked), `sample-build/docs/…`, `skills/…` (reference, excluded per AGENTS) | ⚠️ **FAIL on `.env`** — CI would error; remediation below |
| Dangerous patterns | `rg eval\|innerHTML\|NEXT_PUBLIC_ src/` | No hits in `src/` | ✅ |
| Owner isolation | `rg eq\(conversations.owner src/` | Every conversation query filtered by `owner` (chat route lines 96,128 + conversations routes 21,25,31) | ✅ |
| Origin gate | `rg isSameOriginRequest src/` | Pure function in `origin.ts:9`, used via `server.ts:61` | ✅ |

### Critical finding — doc-code drift (P0)

- **Claim in docs/CODE_REVIEW_REPORT C2 & AGENTS:** `.env` was untracked in `dc1c664` via `git rm --cached .env` and `.gitignore` now effective.
- **Reality at `HEAD` (`eb654aa`):** `git ls-tree -r HEAD -- .env` → `100644 blob c1b6596 … .env`; `git ls-files` lists `.env`; `git check-ignore -v .env` returns nothing (file is tracked, ignore has no effect). The commit `dc1c664` shows `--stat` with only `ci.yml` + `prompt-to-create.md` — no `.env` deletion — so the untrack never happened.
- **Risk:** `NVIDIA_API_KEY="nvapi-vn-hb…"` is public in git history (`7afe083` onward) and still tracked; every `git clone` receives it; CI secret-scan would fail on next push if it scans `:`-excluded only `package-lock.json`.
- **Required fix (before next push):**
  ```bash
  git rm --cached .env   # keep local file; do NOT delete working copy
  git commit -m "security: untrack .env (was still tracked after dc1c664)"
  # then rotate the key at build.nvidia.com and update local .env + deployment env
  git grep -lIE 'nvapi-' -- . ':!package-lock.json'   # should no longer list .env
  ```
- **Why CI didn't catch it yet:** CI trigger was corrupted (`branches: ain]`) until `dc1c664`; after repair it now includes the scan, but no push has exercised it since the (failed) untrack.

All other dimensions (streaming, retention, SSE parser, navigation-frame, limits, headers) aligned with docs at this commit.

---

## Next Action (requires your confirmation)

- **Option A — "approve remediation"**: untrack `.env` as above, rotate the provider key, re-run gates (`typecheck → lint → test → build`), and append a `docs/CODE_REVIEW_REPORT.md` addendum for this finding.
- **Option B — "validate read-only"**: leave `.env` as-is and only continue read-only alignment checks (E2E needs a disposable `DATABASE_URL` + `npm run build && npm start`).
- **Option C — "full E2E"**: provision a disposable PG and run `npx playwright test` to complete Dimension H5/H6 live probes.

Tell me which option to execute.
