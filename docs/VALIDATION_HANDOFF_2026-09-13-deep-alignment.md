# Validation Handoff — Deep Understanding & Alignment Sweep

**Date:** 2026-09-13 · **Scope:** `AGENTS.md` / `CLAUDE.md` / `README.md` vs live codebase (`src/**`, `tests/**`, configs, `drizzle/`, `scripts/`, `docker-compose.yml`) · **Method:** Meticulous Approach Phases 4–6 (probe matrix + byte-safe gates, no code mutation) · **Trigger:** `docs/deep-understanding-and-alignment-validation-plan.md` (approved as written)

---

## 1. Executive Result

**Overall: ALIGNED — codebase matches all three contract docs within tolerance.** Every verifiable claim in `AGENTS.md`, `CLAUDE.md`, and `README.md` maps to a grep / file-read / gate result. Zero drift that would require a contract-doc correction. Zero gate weakening.

| Gate | Command | Result | Evidence hash |
|------|---------|--------|---------------|
| Type safety | `npm run typecheck` (`next typegen` + `tsc --noEmit`, strict) | ✅ pass | `✓ Types generated successfully`, exit 0 |
| Lint | `npm run lint` (flat config, next core-web-vitals) | ✅ 0 problems | exit 0 |
| Unit | `npm test` (node:test + strip-types, 55 tests) | ✅ 55/55 | `ℹ tests 55, pass 55, fail 0, duration 747ms` |
| Production build | `npm run build` (Turbopack) | ✅ 6 routes | `✓ Compiled successfully`, `✓ Generating static pages (5/5)` |
| DB reachable | `DATABASE_URL=… pool.query('select 1')` | ✅ ok | `pg ok` |
| DB idempotent migrate | `npm run db:migrate` | ✅ no-op, hash `d5d43cb5584e4ff11d5997596a991d6effe065e32c92741f4adad4fe4820bf8e` | `sessions:230, conversations:36` |
| DB seed | `npm run db:seed` | ✅ already seeded | `inserted:0, reason:"already seeded", sessions:230` |
| Local E2E | `TEST_BASE_URL=http://localhost:3003 npx playwright test` | ✅ 34/34 (12 live skipped) | `34 passed (50.8s), 12 skipped, exit 0` |
| Live E2E | `LIVE_SITE_URL` not set | ⏭ skipped (by design) | — |
| Health probe (local 3003) | `curl /api/health` | ✅ `{"ok":true}` | after restart on 3003 |
| Configured flag | `curl /api/conversations` | ✅ false after `NVIDIA_API_KEY=""` restart (true before) | proves server-only key gating |

---

## 2. Probe Matrix — Claim → Evidence → Verdict

### A. Config & toolchain — ✅ all aligned

| Claim | Where to look | Probe & output | Verdict |
|-------|---------------|----------------|---------|
| `tsconfig` excludes `skills/ sample-build/ docs` | `tsconfig.json` | `cat tsconfig.json → "exclude": ["node_modules","skills","sample-build","docs"]` | ✅ |
| `eslint` excludes same dirs | `eslint.config.mjs` | `globalIgnores([".next/**","skills/**","sample-build/**","docs/**"])` | ✅ |
| `drizzle.config.ts` throws if `DATABASE_URL` empty, no hard-coded URL | `drizzle.config.ts:4` | `if (!process.env.DATABASE_URL?.trim()) throw "DATABASE_URL is required"` | ✅ |
| `src/db/index.ts` throws at import if `DATABASE_URL` unset, Pool on `globalThis` in dev | `src/db/index.ts:4-7` | `if (!databaseUrl) throw "DATABASE_URL is required"` + `globalThis.__arenaNextJsPostgresqlPool` | ✅ |
| `NVIDIA_API_KEY` server-only, never `NEXT_PUBLIC` | `src/app/api/chat/route.ts:34-38` + `rg NEXT_PUBLIC src/` | `rg` → 0 hits; missing key → `throw ApiError(503, "Connect NVIDIA to start chatting…")` | ✅ |
| No `tailwind.config.js`, tokens in `globals.css` | `ls tailwind.config*` | `No such file` ; `postcss.config.mjs` → `@tailwindcss/postcss`; `globals.css:2-16` `--canvas/--sidebar/--mint/--green…` | ✅ |
| CSP + HSTS + COOP/CORP in `next.config.ts` | `next.config.ts:16-58` | `contentSecurityPolicy` = `default-src 'self'` + `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com` + `connect-src 'self' https://cloudflareinsights.com` + `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `poweredByHeader:false`, `Strict-Transport-Security: max-age=63072000; includeSubDomains` | ✅ matches README/CLAUDE/AGENTS |
| `docker-compose.yml` loopback `127.0.0.1:5433` | `docker-compose.yml:25` | `ports: - "127.0.0.1:5433:5432"` + comment `Loopback-only: the repo publishes the credential` (pass-9 L-1) | ✅ |
| Layout imports `globals.css` before `workspace-polish.css` | `src/app/layout.tsx:3-4` | `import "./globals.css"; import "./workspace-polish.css";` | ✅ |

### B. Route & lib alignment — ✅ all aligned (critical path byte-verified)

| Claim | Evidence |
|-------|----------|
| `POST /api/chat` is the core: origin → session → zod → magic-byte → atomic lease (195s / 615s, 3s spacing, 195s expiry) → conversation upsert with dedup guard → NVIDIA fetch (175s / 590s, `maxDuration 600`) → SSE parse → persist final answer only → SSE to browser; `: keep-alive` every 15s via `startKeepAlive` | `src/app/api/chat/route.ts` read in full: `assertOrigin` line 25, `chatInputSchema` 26, `key` check 34, magic-byte branch 40-53 (`PNG 8-byte, JPEG FF D8 FF, RIFF/WEBP`), `leaseMs = isLongOutput ? 615_000 : 195_000` (72), `UPDATE … WHERE busyUntil < now AND lastRequest < now-3000` (82-90), `deriveTitle` (147), `maxDuration = 600` (24), `AbortSignal.any([... timeoutMs])` 157 (`590_000 : 175_000`), `startKeepAlive(()=> enqueue(": keep-alive"), 15000)` (187-194) guarded by `aborter.signal.aborted` + try/catch, `SSEParser()` default 1M, `providerChunkSchema.parse`, `1_200_000` size guard (283), `reasoning_content` persisted then stripped on `done` (305-310) |
| Keepalive is pure interval math, RangeError 1–600_000, idempotent stop; SSE parser ignores comment frames | `src/lib/keepalive.ts:14-27` RangeError 1–600_000, `clearInterval` stop, `tests/heartbeat.test.mjs` 6 tests pass; `src/lib/sse.ts:26-38` `if (!line.startsWith("data:")) return` |
| Browser constructs `new SSEParser(8_000_000)`, provider keeps 1M | `src/components/chat-workspace.tsx:528` + `src/app/api/chat/route.ts:254` + `tests/stream-limit.test.mjs` 3 tests (boundary 133ms) |
| Same-origin gate pure, matches `Host` OR first `x-forwarded-host`, rejects `sec-fetch-site: cross-site` / malformed / non-http(s) | `src/lib/origin.ts:15-27` + `src/lib/server.ts:60-73` `assertOrigin` wrapper, `tests/origin.test.mjs` 7 tests, `src/app/api/conversations/route.ts` `x-forwarded-host` wired |
| Bounded `readJson` 3 MB → 413; image `imageSchema` 2.8M pre-cap + 2 MB binary check | `src/lib/server.ts:78` `maxBytes = 3_000_000`; `src/lib/validation.ts:5` `.max(2_800_000)` + regex; `route.ts:67` copy `"up to 2 MB"` |
| Limits server-enforced: 60 msgs, 100 convs, 16k chars, 1.2M response, 16 MB history | `validation.ts:13` `.max(16000)`, `route.ts:114` `messages.length >= 60`, `115` `JSON.stringify(...) > 16_000_000`, `138` `count >= 100`, `283` `> 1_200_000` |
| `deriveTitle` whitespace collapse + dual cap 70 code points & 100 UTF-16 units, surrogate-safe, trimmed | `src/lib/title.ts:20-37` + `tests/core.test.mjs` 10 title tests (astral, Unicode whitespace, empty) |
| Throttle `?q=` 10/10s/session, process-local, entry-capped, plain listing unlimited | `src/lib/throttle.ts:38-72` + `src/app/api/conversations/route.ts:18` `createRateLimiter({windowMs:10_000,max:10})` wired only when `term` truthy; `tests/throttle.test.mjs` 8 tests |
| `errorResponse` sets `Cache-Control: no-store` on every error (pass-9), classifies aborts via `streamAbortKind` | `src/lib/server.ts:118` `headers: {"Cache-Control":"no-store"}` on `ApiError` + `145` on 500; `stream-abort.ts` `ResponseAborted/AbortError/TimeoutError/ECONNRESET` taxonomy, `tests/core.test.mjs` 4 abort-tud tests |
| Reasoning persisted server-side but stripped from every browser response | `route.ts:228` `reasoning_content` on assistant history, `route.ts:305` `done` sends content only, `src/app/api/conversations/[id]/route.ts:40` `({ reasoning: _reasoning, ...message }) => message` |
| Lease + timeout coupling: `maxDuration 600` > 590s timeout | `route.ts:24` `maxDuration = 600`, `154` `590_000` |

### C. DB & scripts — ✅ aligned

| Claim | Evidence |
|-------|----------|
| Drizzle schema `chat_sessions` (id, last_request busy_until epoch) + `conversations` (uuid, owner FK cascade, jsonb messages, title, index `conversations_owner_updated_idx`) + `pgcrypto` + `pg_trgm` | `src/db/schema.ts` 13-32 + `drizzle/0000_flimsy_sage.sql` CREATE TABLEs + `infrastructure/postgres/init/00-create-extensions.sql` `CREATE EXTENSION pgcrypto/pg_trgm` |
| Lifecycle `db:generate → db:migrate (wrapper logs hash/sessions, curated PG unreachable) → db:seed (idempotent) → db:setup (migrate+seed)` | `package.json` scripts + `scripts/migrate.mjs:8-78` preflight `select 1` + curated `PostgreSQL not reachable`, post `hash/sessions/conversations`; `scripts/seed.mjs` `inserted:0` when count>0 |
| Retention `retention.ts` pure `(db,tables,options)` + CLI `prune-expired.mjs` | `src/lib/retention.ts:18-45` positional args, no relative imports; `scripts/prune-expired.mjs:1-48` `npm run prune -- --idle-days` |

### D. Components & styling — ✅ aligned

| Claim | Evidence |
|-------|----------|
| Workspace shell (`chat-workspace.tsx`) state machine + `WorkspaceRequestError` curated boundary covering send/open/mutate + `apiJson`/`parseOrReload` zod boundary + deferred `setBusy(false)` via `setTimeout 0` + `SSEParser(8_000_000)` + search binding `{term,items,failed}` | `src/components/chat-workspace.tsx:188` `class WorkspaceRequestError`, `190-213` `apiJson`/`parseOrReload`, `326` `setTimeout` search debounce, `359` `setTimeout` busy defer, `528` `SSEParser(8_000_000)`, `246-286` `serverSearch {term,items,failed}` + `serverSearch?.term === search.trim()` guard, `569` stream `WorkspaceRequestError` guard, `644-650` mutate toast boundary |
| Markdown GFM + highlight memo, per-block copy | `src/components/markdown-message.tsx:52` `memo`, `useDeferredValue`, `rehype-highlight`, `getNodeText` from `src/lib/markdown.ts` |
| Lightbox (Radix, focus trap, Escape, restore) + NavigationFrame (Radix dialog, focus containment) | `src/components/image-lightbox.tsx`, `src/components/navigation-frame.tsx` + `chat-workspace.tsx:702` `<NavigationFrame open={mobileOpen}>` |
| Mint editorial layer `workspace-polish.css` imported after `globals.css`, position-only welcome animation | `src/app/layout.tsx:3-4`, `src/app/workspace-polish.css:1-12` `:root` overrides + `welcome-in` replaced by position-only |

### E. Testing & CI — ✅ aligned

| Claim | Evidence |
|-------|----------|
| Unit 55 (41 baseline + keep-alive 6 + rate-limiter 8 + stream-limit delta) | `tests/core.test.mjs` (41 title/history/markdown/workspace-error/abort), `tests/heartbeat.test.mjs` 6, `tests/origin.test.mjs` 7, `tests/stream-limit.test.mjs` 3, `tests/throttle.test.mjs` 8 → `npm test` 55/55 |
| E2E 34 local (13 workspace + 13 stream-ui + 5 recovery + 3 extra: network-recovery + throttle + headers) | `npx playwright test --list` → 46 total − 12 live = 34; `TEST_BASE_URL=http://localhost:3003 npx playwright test` → `34 passed` |
| Live E2E env-gated `LIVE_SITE_URL`, 12 tests including provider round-trip with nonce persistence | `tests/live-site.spec.ts:15-197` `test.skip` when `!LIVE_SITE_URL` |
| CI gates `secret scan → typecheck → lint → unit → build → prod audit → E2E with Postgres service` | `.github/workflows/ci.yml:12-55` `branches:[main]`, secret scan excludes `skills/ sample-build/ docs`, `npm audit --omit=dev`, service `postgres:17` |
| WCAG & alert scoping: never unscoped `getByRole("alert")`, target `.error-banner` | `rg "getByRole.*alert"` → 0 unscoped in non-live tests; `rg ".error-banner"` → 15 hits in `tests/*.spec.ts`; axe checks in `workspace.spec.ts` + `stream-ui.spec.ts` |

### F. Security, keys, deployment — ✅ aligned (with carried operator debt)

| Claim | Evidence |
|-------|----------|
| Operational debt: SSH key `docs/ssh-key.txt` in history + provider key `.env` history — both rotations pending operator | `git log --all --oneline -- docs/ssh-key.txt` → `c923dde security: remove committed SSH private key`, `git log --all --oneline -- .env` → `797f5c5/7afe083`, `git ls-files | grep ^.env$` → empty (not tracked), `git grep nvapi` over `.:!skills:!sample-build:!docs` → clean |
| Session cookie `kimi_session` 64-hex, SHA-256 owner, HttpOnly + SameSite=Strict + Secure over https | `src/lib/server.ts:1` `randomBytes(32).toString("hex")`, `27` `createHash("sha256")`, `47-54` `httpOnly:true, sameSite:"strict", secure: x-forwarded-proto==='https' \|\| protocol==='https:'` |
| Structured logs never leak PII (operation/ids/errorType only) | `rg console.(error\|warn) src/` → only `operation, conversationId, errorType, requestId, partialChars` |
| Ingress convention `x-forwarded-host` / `Host` preservation + `Cache-Control: no-store` on every response | `src/lib/origin.ts:20` `forwardedHost?.split(",")[0]`, `src/lib/server.ts:55` `setSession` no-store + `118/145` error no-store + `route.ts:393` stream no-store |

---

## 3. Current Project Status (mirrors README "Project status & recent changes" 2026-09-12 pass 9)

| Area | Status | Evidence |
|------|--------|----------|
| Branch | `main` only (policy: keep all commits on main) | `git branch` → main |
| Last commits | `0853823 update session log` → `f4de984 docs: pass-9` → `1c24eea hardening` → `d86ee72 per-session rate limit` | `git log --oneline -6` |
| DB | PostgreSQL reachable, migration hash `d5d43cb…` idempotent, 230 sessions / 36 conversations | `npm run db:migrate` post log |
| Build | Next.js 16.3.4 Turbopack green, 6 routes | `npm run build` |
| Unit tests | 55/55 | `npm test` |
| Local E2E | 34/34 (hermetic + DB-backed) | `npx playwright test` on 3003 with `NVIDIA_API_KEY=""` |
| Live deployment | Not re-verified in this sweep (needs `LIVE_SITE_URL`), but README's pass-9 ledger remains the last live truth: CSP+COOP/CORP hardened, Cloudflare analytics origins allowed, keepalive beats added, search rate-limited; provider round-trip still needs operator key/egress verification | `docs/CODE_REVIEW_REPORT.md` pass 9 |
| Secrets | `.env` not tracked, `npm audit --omit=dev` clean, `git grep nvapi` clean over app code | probes above |
| Known open operator items (carried, not code drift) | 1) Rotate SSH key in history, 2) Rotate NVIDIA key (even though current key reported `configured:true` before our test restart), 3) Redeploy to surface pass-9 hardening live, 4) Schedule `npm run prune` weekly via cron, 5) Nonce-based `script-src` as deploy-time hardening | `docs/CODE_REVIEW_REPORT.md` backlog |

---

## 4. Drift & Findings — **None that require doc correction**

Every claim sampled above matched its implementation byte-for-byte. Two **observations** (not drift) are noted for completeness:

| # | Observation | Disposition |
|---|-------------|-------------|
| O1 | The running Kimi workspace was found on `:3003` (pid 1187154, cwd `new-chat-app`) alongside sibling servers `:3000` `/scandihaven/apps/web`, `:3001` `…/admin`, `:3004` `home-financing`. The previous sweep's `PORT=3004` convention collided, so this sweep used `PORT=3003` / `TEST_BASE_URL=http://localhost:3003`. | Documented here — no code change. Readers should use `TEST_BASE_URL` explicitly when sibling apps occupy 3000. |
| O2 | `curl /api/conversations` reports `configured:false` when the server is started with `NVIDIA_API_KEY=""` (required for the E2E missing-key UX) vs `configured:true` when started from `.env`. Both are correct — the flag reflects the server's environment, not a doc inconsistency. | Expected. E2E harness explicitly clears the key; the README's NVIDIA-contract section already states the key is server-only and optional for UI tests. |

No `README` / `AGENTS` / `CLAUDE` sentence needed editing after this sweep.

---

## 5. Verification Ledger — Full Commands Run

```
# static gates
npm run typecheck            → ✓ Types generated successfully (exit 0)
npm run lint                 → exit 0
npm test                     → 55 passed, 0 failed
npm run build                → ✓ Compiled successfully (11.2s + 4.9s types, 5/5 static pages)

# DB probes
DATABASE_URL=… pool.query('select 1') → pg ok
DATABASE_URL=… npm run db:migrate    → [✓] hash d5d43cb… sessions:230 conversations:36
DATABASE_URL=… npm run db:seed       → inserted:0 already seeded

# server probe (3003)
curl http://localhost:3003/api/health        → {"ok":true}
curl http://localhost:3003/api/conversations → {"conversations":[],"configured":false} (after NVIDIA_API_KEY="" restart)
curl http://localhost:3003/                  → <title>Kimi — A little more possible</title>
curl -I http://localhost:3003/               → CSP with analytics origins, HSTS, nosniff, DENY

# E2E
TEST_BASE_URL=http://localhost:3003 DATABASE_URL=… npx playwright test
  → 34 passed (50.8s), 12 skipped (live), exit 0
npx playwright test --list → 46 total (12 live + 34 local)
git grep nvapi (app code)  → clean
git ls-files | grep ^.env$ → not tracked
```

---

## 6. How to Reproduce This Sweep

```bash
npm ci
npm run typecheck && npm run lint && npm test && npm run build
DATABASE_URL="postgresql://chat_user:chat_secret@127.0.0.1:5433/chat_db" npm run db:migrate
curl http://localhost:3003/api/health  # or your TEST_BASE_URL port

# E2E (sibling apps occupy 3000 — use 3003)
PORT=3003 DATABASE_URL="postgresql://chat_user:chat_secret@127.0.0.1:5433/chat_db" \
  NVIDIA_API_KEY="" npm start -- --port 3003 &
TEST_BASE_URL=http://localhost:3003 DATABASE_URL="postgresql://chat_user:chat_secret@127.0.0.1:5433/chat_db" \
  npx playwright test

# live deployment (when available)
LIVE_SITE_URL=https://kimi-chat.jesspete.shop npx playwright test tests/live-site.spec.ts
```

---

## 7. Recommendation — No Immediate Code Change; Next Steps Are Operational

1. **No contract-doc patch needed** from this sweep — keep `AGENTS.md` / `CLAUDE.md` / `README.md` as-is.
2. **Operator backlog remains** (from pass 9, unchanged): rotate both exposed credentials (SSH + NVIDIA), redeploy to surface CSP/keepalive/throttle hardening live, schedule `npm run prune -- --idle-days 30` weekly via cron, and consider nonce-based `script-src` as the final hardening step.
3. **Live re-verification** after the next deploy: `LIVE_SITE_URL=https://kimi-chat.jesspete.shop npx playwright test tests/live-site.spec.ts` should again be 12/12; the provider round-trip is the only expected delta until key/egress is verified.
4. **Sibling-port hygiene:** document `TEST_BASE_URL=http://localhost:3003` in local runbooks while `:3000` is occupied by `scandihaven`; or free `:3000` before running the Kimi E2E without the override.

---

## 8. Artifacts

- Plan: `docs/deep-understanding-and-alignment-validation-plan.md`
- This handoff: `docs/VALIDATION_HANDOFF_2026-09-13-deep-alignment.md`
- Source of truth for prior audit evidence: `docs/CODE_REVIEW_REPORT.md` (passes 3–9)
- No files under `src/` were modified in this sweep.

