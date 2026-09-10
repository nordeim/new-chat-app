# Deep Understanding & Alignment Validation Plan — Kimi Workspace

> **Scope:** `AGENTS.md` · `CLAUDE.md` · `Project_Architecture_Document.md` (PAD v1.0) · `README.md` vs. live codebase (`src/`, `tests/`, `drizzle/`, `scripts/`, configs, CI, Docker, live deployment)
> **Method:** Six-phase meticulous approach — ANALYZE (deep doc mining) → PLAN (this document) → VALIDATE (evidence, not claims) → IMPLEMENT (only if drift found) → VERIFY (gates) → DELIVER
> **Date:** 2026-09-10 · **HEAD:** `8e44e28` (`main` → `origin/main`, 3 commits ahead of PAD's verified `f888508`) · **Author:** Claw Code (Frontend Architect)
> **Companions:** `AGENTS.md` (ops checklist), `CLAUDE.md` (six-phase + standards), `Project_Architecture_Document.md` (blueprint), `README.md` (onboarding ramp), `docs/CODE_REVIEW_REPORT.md` (audit ledger, pass 3)

---

## 0. How to use this plan

1. **Read §1–§3** to acquire the deep understanding before touching code — every decision traces to a rationale, nothing is "because it's popular."
2. **Execute §4** dimension-by-dimension; each task is independently verifiable (file/line + command + expected observable). Tick only with cited evidence.
3. **Run §5 gates last** — `typecheck → lint → test → build → (optional) E2E` in order; never weaken gates.
4. **Close with §6–§8** — Done-when checklist, risk register, current status snapshot.

This plan does **not** write code. It is the VALIDATE checkpoint the `AGENTS.md`/`CLAUDE.md` workflow requires before any implementation. Execution needs your explicit go-ahead (see §8).

---

## 1. Deep Understanding Synthesized (ANALYZE — all four docs cross-checked)

### 1.1 Project Identity (quadruple-checked)

- **What:** Next.js 16 App Router chat workspace "Kimi" — streamed NVIDIA NIM `moonshotai/kimi-k3` (OpenAI-compatible SSE), PostgreSQL persistence via Drizzle ORM + `pg`, browser-session cookie isolation (64-hex token, SHA-256 digest stored as `owner`), React 19 single client component, Tailwind v4 CSS-first (`--mint` palette), TypeScript strict, zod v4, Playwright + `node:test` + axe WCAG 2.2 AA.
- **Why it exists:** Most chat starters are single-prompt, no persistence, no streaming ergonomics, no visitor isolation. Kimi pairs server-proxied inference with PG persistence, session-isolated history, calm mint UI, and is maintained as a clean starter suitable for enterprise adoption work.
- **Core invariants (verbatim in all four docs):**
  1. **Server is authority** — every limit, ownership check, validation enforced server-side; client mirrors for UX only.
  2. **No silent failure** — curated, actionable user-facing copy + structured JSON logs `{operation, ids, errorType}` never message content/cookies/keys.
  3. **Streaming integrity** — only complete provider answers persisted; partial/failed streams surface explicit errors and stay retryable.
  4. **Session isolation** — every conversation query filters by `owner`; writes require same-origin `Origin` gate.
  5. **Curated failure surfaces** — initial-load failures always show reload guidance; degraded-API HTML never leaks raw parse errors.

### 1.2 Technology Stack (locked, verified against `package.json`, `drizzle.config.ts`, `next.config.ts`, `docker-compose.yml`)

| Layer | Technology | Version (package.json) | PAD claim | README claim | Delta |
|-------|------------|------------------------|-----------|--------------|-------|
| Web Framework | Next.js App Router (Turbopack) | `16.3.4` | `16.3.4` | `16` | ✅ |
| UI Runtime | React + react-dom | `19.3.0` | `19.3.0` | `19` | ✅ |
| Language | TypeScript strict | `5.9.3` | `5.9.3` (`strict`, `noEmit`, `isolatedModules`, `ES2017`, `bundler`) | `5.9` | ✅ |
| Styling | Tailwind CSS CSS-first + PostCSS | `4.3.3` + `@tailwindcss/postcss 4.3.3`, `postcss 8.5.28` | `4.3.3` | `4.1` | ⚠️ minor doc drift (README behind) |
| Primitives | Radix Dialog | `1.1.23` | `1.1.23` | not listed | ✅ |
| Validation | zod | `4.6.1` | `4.6.1` | `4.6` | ✅ |
| Data ORM | Drizzle ORM + pg + drizzle-kit | `0.45.2` / `8.23.0` / `0.31.10` | same | `0.45 / 8.20` | ⚠️ README `pg` minor behind |
| Database | PostgreSQL | `17-alpine` (local), `14+` supported | `17-alpine`, `5433:5432`, `chat_data`, `pgcrypto+pg_trgm` | `14+` | ✅ |
| AI Provider | NVIDIA NIM OpenAI-compatible | `integrate.api.nvidia.com/v1/chat/completions`, `moonshotai/kimi-k3`, `stream:true` | same | same | ✅ |
| Testing Unit | `node:test` + `--experimental-strip-types` | Node ≥22 | same | same | ✅ |
| Testing E2E | Playwright + axe-core | `1.63.0` / `4.13.0` | `1.63.0` / `4.13.0` | `—` | ✅ |
| Icons/Markdown | lucide-react, react-markdown, remark-gfm | `1.43.0`, `10.1.0`, `4.0.1` | same | — | ✅ |
| Build | Next Turbopack + next typegen + tsc + ESLint flat | `eslint 9.39.5`, `eslint-config-next 16.3.4` | same | — | ✅ |

### 1.3 Architecture Decisions (ADRs) — PAD §1.3 distilled

| ADR | Decision | Rationale (why) | Code anchor | Alternatives rejected |
|-----|----------|-----------------|-------------|----------------------|
| ADR-001 App Router | Next.js 16 App Router, `runtime=nodejs`, `maxDuration=180` on `/api/chat`, `dynamic=force-dynamic` on conversations | Per-route streaming `text/event-stream` without custom server, typed route params via `next typegen`, headers versioned with code | `src/app/api/chat/route.ts:7-8`, `next.config.ts` | Vite SPA+Express (two deploys), Remix |
| ADR-002 Drizzle+pg | `drizzle-orm 0.45.2`, `pg` Pool cached on `globalThis` in dev, `drizzle.config.ts` via `dotenv/config` single source | Explicit SQL (`jsonb_array_elements` search), reviewable plain SQL migrations, controllable Pool for `FOR UPDATE` | `src/db/index.ts`, `drizzle.config.ts`, `drizzle/0000_flimsy_sage.sql` | Prisma (weaker jsonb/FOR UPDATE) |
| ADR-003 SHA-256 Cookie | `kimi_session` 64-hex (`randomBytes(32).hex`), HttpOnly Strict, Secure when https/`x-forwarded-proto:https`, SHA-256 stored as `sessions.id` → `conversations.owner` | No JWT rotation, no user table, no PII; owner-scoped queries | `src/lib/server.ts:sessionId, ensureSession, setSession` | Auth.js/Better Auth (overkill) |
| ADR-004 Same-Origin Gate | Pure `isSameOriginRequest(origin,host,forwardedHost,secFetchSite)` — accepts `Host` OR first `x-forwarded-host`, rejects `cross-site`/malformed/non-http(s) | Cloudflare rewrites `Host`; public host arrives as `x-forwarded-host`; browser cannot forge `Origin`/`sec-fetch-site` | `src/lib/origin.ts`, `src/lib/server.ts:assertOrigin` | Host-only check (broken behind ingress) |
| ADR-005 Incremental SSE | `SSEParser` LF/CRLF/CR, split-CRLF `skipLF`, exactly-one-space `data:`, multiline `\n`-join, incremental 1M limits, `finish()` as `push("\n\n")`, shared server+client | Network-chunk-independent limits; spec parity | `src/lib/sse.ts`, `tests/core.test.mjs` | naive `split("\n\n")`, per-side parsers |
| ADR-006 Radix Drawer | `navigation-frame.tsx` — Radix Dialog when `mobileOpen`, focus containment + Escape + `onCloseAutoFocus` → opener, `.sidebar-close` inside drawer | WCAG drawer without manual focus trap | `src/components/navigation-frame.tsx`, `src/app/globals.css` | CSS scrim + manual trap |
| ADR-007 CSS-first @theme | No `tailwind.config.js`; `@import "tailwindcss"` + `:root` tokens in `src/app/globals.css` | Single source `--mint` etc., no JS config drift | `src/app/globals.css`, `postcss.config.mjs` | `tailwind.config.js` |

### 1.4 Layer Model (Golden Rule) — PAD §3.1

```
Layer 0 Edge — TLS ingress: preserve public Host OR forward x-forwarded-host; no untrusted proxy-header path.
Layer 1 App Router — route handlers: owner-scoped; writes require isSameOriginRequest + requireSession/ensureSession; only /api/chat touches provider.
Layer 2 Domain — src/lib (origin, server, validation, sse, types) + src/db (schema, index): zod at boundaries, origin pure, SSE shared, parameterized Drizzle only.
Layer 3 Features — src/components (chat-workspace ~1500 lines, navigation-frame 46 lines): one client component, zod validates every API/stream payload via apiJson/parseOrReload, no setState in effects.
Layer 4 Persistence — PostgreSQL via pg.Pool: journal-driven SQL migrations, idempotent seed, pure retention functions.
Golden Rule: Server is authority; no silent failure; streaming integrity (persist final only).
```

### 1.5 Non-Obvious Rules (AGENTS § + CLAUDE § + PAD § cross-merged)

- `tsconfig.json` + `eslint.config.mjs` deliberately exclude `skills/`, `sample-build/`, `docs/` — reference material, never app code. Do not remove excludes.
- After lint autofix, re-run formatting/order-sensitive gates and restage index.
- Error copy is curated, actionable, never generic, never leaks provider internals. Logs are structured JSON with `operation/ids/errorType` only.
- `reasoning_content` persisted for multi-turn but stripped from every browser payload (`GET [id]` maps `reasoning` out, `done` sends `content` only).
- Limits server-authoritative (60 msgs/conv, 100 convs/workspace, 16k chars, 2 MB image, 600k response, 3 MB body, 8 MB history, 195 s lease, 175 s provider timeout, 3 s spacing); client mirrors for UX.
- No `tailwind.config.js`; tokens live in `src/app/globals.css` (`--canvas #fcfdfb`, `--sidebar #f5f7f3`, `--mint #e8f0e2`, `--green #306345`, `--radius 14px`).
- Never weaken gates (`@ts-ignore`, disabled rules, deleted tests) — fix root causes.
- Commits stay on `main`; operational debt: SSH private key in git history (`docs/ssh-key.txt` removed from tracking, still in history) + former NVIDIA key in `.env` (untracked at `272d7ff`) — both rotations pending operator confirmation, never reintroduce, never track `.env`.
- TLS ingress must preserve public `Host` or forward `x-forwarded-host` (Cloudflare/nginx convention); otherwise origin gate 403s — README troubleshooting documents the failure mode.
- `scripts/` are `.mjs` with explicit `.ts` extensions (Node type-stripping requires extensions, no `@/` alias); `retention.ts`/`seed.ts` receive injected `{db,tables}` and keep runtime imports to `drizzle-orm`.

### 1.6 Commands & Verification Order (all docs agree)

| Task | Command | Notes |
|------|---------|-------|
| Install | `npm ci` | Use ci, not install; Node ≥22 |
| Dev | `npm run dev` | `next dev`, HMR, globalThis Pool cache |
| Build | `npm run build` | Turbopack, 6 routes |
| Lint | `npm run lint` | ESLint flat + next/core-web-vitals, excludes non-app |
| Typecheck | `npm run typecheck` | `next typegen && tsc --noEmit` (route types never stale) |
| Unit | `npm test` | `node --experimental-strip-types --test tests/*.test.mjs` → 15/15 |
| Single unit | `node --experimental-strip-types --test tests/core.test.mjs` | — |
| E2E | `npm run test:e2e` | Needs prod preview + disposable DATABASE_URL, no NVIDIA_API_KEY |
| Live E2E | `LIVE_SITE_URL=https://host npx playwright test tests/live-site.spec.ts` | Skipped unless LIVE_SITE_URL set |
| Prune | `npm run prune -- --idle-days 30 [--conversation-days 90]` | — |
| Generate migration | `npm run db:generate` | Edit schema.ts first → commit drizzle/*.sql |
| Apply migrations | `npm run db:migrate` | Production-safe, journal-driven |
| Seed | `npm run db:seed` | Idempotent, safe to re-run |
| Push schema (dev) | `npx drizzle-kit push` | Prototyping only |
| Verification order | `typecheck → lint → test → build → (if DB/UI touched) test:e2e` | Never skip typegen |

---

## 2. System Topology & Data Architecture (PAD §2–§4)

**Runtime flow:** Browser (`chat-workspace.tsx` + `navigation-frame.tsx` + client `SSEParser`) → TLS ingress (Cloudflare/nginx, must forward `x-forwarded-host`/`x-forwarded-proto`) → Next.js 16 (`POST /api/chat` with `runtime nodejs, maxDuration 180` → origin→session→zod→magic-byte→atomic lease (3s/195s)→ upsert with duplicate-retry guard → NVIDIA SSE → `providerChunkSchema` → persist final only → SSE `meta/thinking/delta/done/error` → browser) + `GET /api/conversations?q=` (ILIKE title + `jsonb_array_elements → content`, escaped, owner-filtered) + `GET/PATCH/DELETE /api/conversations/[id]` (ownership via `identity()`, `FOR UPDATE` + 409 if busy) + `GET /api/health` (select 1 probe).

**Schema:** `chat_sessions(id text PK, created_at, last_request epoch default, busy_until epoch default)` + `conversations(id uuid PK gen_random_uuid, owner text FK→sessions.id cascade, title, messages jsonb ChatMessage[] default [], created_at, updated_at, index owner_updated)`. SQL truth: `drizzle/0000_flimsy_sage.sql` + `drizzle/meta/_journal.json`.

**Data models:** `ChatMessage {id, role user|assistant, content 1-16000 trimmed, image? data-uri ≤2.8M chars + 2MB magic-byte, reasoning?}`; `ConversationSummary {id,title,updatedAt}`; `ChatSettings {temperature 0-2 default 1, maxTokens 256-16384 default 16384, reasoningEffort low|high|max default max}`. **Persistence:** `pg.Pool` cached on `globalThis` in dev, `drizzle(pool)`, throws if `DATABASE_URL` missing; Drizzle parameterized only; migrations journal-driven; seed idempotent `onConflictDoNothing`; retention pure `pruneIdleSessions` (cascade) + `pruneStaleConversations`.

---

## 3. Design System, Security, Testing, Build (PAD §5–§8)

- **Design tokens:** `src/app/globals.css` CSS-first `@theme` — `--canvas #fcfdfb`, `--sidebar #f5f7f3`, `--mint #e8f0e2`, `--green #306345`, `--green-dark #244d36`, `--ink #26362f`, `--muted #5f6c55`, `--danger #a44539`, `--radius 14px`; typography `Arial/Helvetica` UI + `Georgia` italic accent, monospace for code; component primitives `composer:focus-within #aabf94`, Radix Dialog, `react-markdown` sanitized (`a→_blank noopener`, `img→[Image: alt]`), `lucide-react` + bespoke `KimiMark`; motion `pulse/thinking dots`, `spin`, `fade-in`, `welcome-in`; responsive 1500/1150/900/700 breakpoints + `prefers-reduced-motion`.
- **Security (S1–S12):** no log of content/cookie/key, every conversation filtered by `owner`, writes require `isSameOriginRequest`, `sec-fetch-site:cross-site` rejected, 64-hex session + SHA-256, HttpOnly Strict Secure cookie, parameterized Drizzle + `searchPattern` escape, `readJson` 3MB + 415/413/400, magic-byte PNG/JPEG/WEBP, no `NEXT_PUBLIC_` key, no `eval/dangerouslySetInnerHTML`, curated `ApiError` + `requestId` on 500. Threat model: CSRF, fixation, IDOR, injection, XSS, DoS, leak, clickjacking, sniff — all mitigated and tested.
- **Testing pyramid:** Unit 2 files/15 tests (`core 8` + `origin 7`, node:test), E2E workspace 12 tests (Playwright request + Drizzle fixtures, WCAG via axe), Stream UI 4 tests (hermetic, mocked APIs), Live Site 12 tests (gated `LIVE_SITE_URL`). Gate order never weakened.
- **Build & deploy:** `npm ci → db:migrate → build → start`; env `DATABASE_URL` required (throws at import), `NVIDIA_API_KEY` server-only (missing→503), `TEST_BASE_URL`/`LIVE_SITE_URL` optional, `.env` untracked+gitignored; Docker Compose `postgres:17-alpine 5433:5432 chat_data+chat_net healthcheck 5s`; CI `.github/workflows/ci.yml` two jobs `gates` (secret scan → typecheck → lint → test → build → audit) + `e2e` (postgres:17 service, db:migrate, build, chromium), `branches:[main]` + `pull_request`.

---

## 4. Validation Plan — Alignment Checks (each row is a verifiable task)

Complete dimensions A–G first, then gates H last. Tick only with a cited file/line or command output.

### Dimension A — Doc-to-Code Contract Alignment

| # | Check | Doc claim | Code location | Command / inspection | Expected observable | Done |
|---|-------|-----------|---------------|----------------------|---------------------|------|
| A1 | Architecture map line-by-line | AGENTS §Architecture map 9 bullets | Each file listed | Open each file, confirm one-line summary matches code: `src/app/api/chat/route.ts`, `src/app/api/conversations/{route.ts,[id]/route.ts}`, `src/lib/origin.ts`, `src/lib/server.ts`, `src/lib/retention.ts`, `src/lib/validation.ts`, `src/lib/sse.ts`, `src/components/chat-workspace.tsx` (~1500 lines), `src/components/navigation-frame.tsx` (46 lines), `src/db/schema.ts` | No missing file, no renamed export, no extra responsibility; `rg -n "export" src/lib/origin.ts` shows `isSameOriginRequest` | ☐ |
| A2 | Limits table parity | README §Data and security boundaries + PAD §4.2 | `src/app/api/chat/route.ts`, `src/lib/validation.ts`, `src/lib/server.ts`, `src/lib/types.ts` | `rg -n "16000|600_000|195_000|175_000|8_000_000|3_000_000|2_800_000" src/` | Values match doc tables exactly: 16k prompt, 60 msgs/8MB history, 600k response, 100 convs, 195s lease/175s timeout/3s spacing, 3MB body, 2.8M image chars | ☐ |
| A3 | Error copy & log hygiene | AGENTS/CLAUDE "no silent failure" + PAD §6.1 S1/S12 | `src/lib/server.ts:errorResponse`, `src/app/api/chat/route.ts` | `rg -n "console\.(log\|error)|ApiError|errorResponse" src/` + spot-check 5 messages (503 "Connect NVIDIA…", 429 "A response is already running…", 403 "This action must be made…", 400 "invalid JSON", 502 "NVIDIA rejected…") | Every route funnels via `errorResponse`; logs are `JSON.stringify({operation,ids,errorType})` with no content/cookie/key; copy curated & actionable | ☐ |
| A4 | PAD ADRs implemented | PAD §1.3 ADR-001…007 | See §1.3 anchors | `git show` each ADR's commits (`d039d1e`, `697ec76`, `c0dfbf1`) + `cat` each file | Each ADR's code shape present (lease `UPDATE…RETURNING`, SSE `skipLF`, Radix `NavigationFrame`, origin pure function, CSS-first tokens, no `tailwind.config.js`) | ☐ |
| A5 | File hierarchy truth | README §File hierarchy + PAD §3.2 dir tree | `src/` | `fd --type f src/` and `fd --type f drizzle/` vs. docs tree | No file in docs missing on disk, no undocumented app file, `skills/sample-build/docs` excluded from tsconfig/eslint | ☐ |

### Dimension B — Security & Isolation (PAD §6)

| # | Check | Command / inspection | Expected observable | Done |
|---|-------|----------------------|---------------------|------|
| B1 | Owner isolation proof | `rg -n "eq\(.*owner" src/` + read `src/app/api/conversations/[id]/route.ts:identity()` | Every `conversations` select/update/delete includes `eq(conversations.owner, owner)` or `condition` from `identity()`; `sessionId()` regex `^[a-f0-9]{64}$` + SHA-256; cookie `httpOnly:true, sameSite:strict, secure` on `https\|x-forwarded-proto` | ☐ |
| B2 | Same-origin gate completeness | `npm test` (origin suite) + `rg -n "isSameOriginRequest\|assertOrigin" src/` | Unit `tests/origin.test.mjs` 7/7: direct, proxied `x-forwarded-host`, chained forwarded-host, http/https vs ftp/javascript, `cross-site`, missing/malformed/null, mismatch; API regression `tests/workspace.spec.ts` proxied-origin `400 not 403` / mismatched `403` | ☐ |
| B3 | Secret hygiene (app code) | `git grep -lIE 'nvapi-[A-Za-z0-9_-]{20,}\|-----BEGIN [A-Z ]*PRIVATE KEY-----\|ghp_[A-Za-z0-9]{20,}\|AKIA[0-9A-Z]{16}' -- src tests scripts drizzle 2>&1` | 0 hits | ☐ |
| B4 | Secret hygiene (tracked files) | `git grep -lIE 'nvapi-…' -- . ':!package-lock.json' ':!skills/**' ':!sample-build/**' ':!docs/**' 2>&1` | 0 hits (CI scans wider — currently hits `skills/trustskill` examples; advisory to scope to app code if noisy) | ☐ |
| B5 | `.env` untracked proof | `git ls-files \| grep "^\.env$"` (expect exit 1) + `git check-ignore -v .env` → `.gitignore:10:.env` + `ls .env` (still present locally) + `git ls-tree -r HEAD -- .env` (expect no output) | `.env` ignored but present locally; history `7afe083` still holds exposed key — rotation pending (C2 carried) | ☐ |
| B6 | No dangerous primitives in app | `rg -n "eval\(|new Function|dangerouslySetInnerHTML|innerHTML|document\.write|NEXT_PUBLIC_" src/` | 0 hits in `src/` | ☐ |
| B7 | `docs/ssh-key.txt` handling | `ls -la docs/ssh-key.txt` + `git ls-files -- docs/ssh-key.txt` + `cat .gitignore \| grep ssh-key` | File exists locally but ignored/un-tracked; still in git history — rotation pending (C1 carried) | ☐ |

### Dimension C — Streaming Integrity (PAD Pattern 2 + §3.3)

| # | Check | Command / inspection | Expected observable | Done |
|---|-------|----------------------|---------------------|------|
| C1 | SSE parser parity (spec) | `cat src/lib/sse.ts` + `npm test` (core suite) | LF/CRLF/CR branches, CRLF split across `push()` via `skipLF`, exactly-one-space `data:` (`slice(5===" "?6:5)`), multiline `\n`-join, incremental `MAX 1_000_000`, `finish()` as `push("\n\n")`; unit tests: fragmented CRLF, lone-CR, split CRLF, comment `: keepalive`, `data:no-space` vs `two-spaces`, incremental 1M rejects | ☐ |
| C2 | SSE shared by server+client | `rg -n "SSEParser" src/` | Imported in both `src/app/api/chat/route.ts` and `src/components/chat-workspace.tsx` | ☐ |
| C3 | Persistence discipline (final only) | Read `src/app/api/chat/route.ts` `if (!completed \|\| !assistant.content) throw` → `if (truncated) …` → `await db.update(conversations).set({messages:[...saved.messages, assistant]})` → `send({type:"done", message:{content only}})` | Error/early-abort paths `send({type:"error"})` and do NOT persist; duplicate-retry guard `last?.role==="user" && content===input && image===input` reuses array | ☐ |

### Dimension D — Data Layer & Migrations (PAD §4)

| # | Check | Command / inspection | Expected observable | Done |
|---|-------|----------------------|---------------------|------|
| D1 | Schema ↔ SQL ↔ seed ↔ config | `cat src/db/schema.ts` vs `cat drizzle/0000_flimsy_sage.sql` + `cat drizzle/meta/_journal.json` + `cat src/db/seed.ts` + `cat drizzle.config.ts` | Sessions `id text PK`, conversations `id uuid PK gen_random_uuid`, `owner→sessions.id cascade`, `messages jsonb`, `index owner_updated`; single migration `0000_flimsy_sage`; `drizzle.config.ts` reads `DATABASE_URL` via `dotenv/config`, `verbose+strict`, no hard-coded URL; seed `onConflictDoNothing` idempotent | ☐ |
| D2 | Pool lifecycle | `cat src/db/index.ts` | `throws if DATABASE_URL missing` at import, `pg.Pool` cached on `globalThis.__arenaNextJsPostgresqlPool` in dev, `drizzle(pool)` exported | ☐ |
| D3 | Query safety | `rg -n "drizzle\|sql\`\|ilike\|searchPattern" src/` | All queries Drizzle-parameterized; `searchPattern` escapes `\ % _` → `ilike` + `sql exists (jsonb_array_elements… ilike)` with bound param | ☐ |

### Dimension E — Client UI, A11y & Design System (PAD §5 + CLAUDE)

| # | Check | Command / inspection | Expected observable | Done |
|---|-------|----------------------|---------------------|------|
| E1 | Chat-workspace contracts | `cat src/components/chat-workspace.tsx` (check `apiJson`, `parseOrReload`, `streamEventSchema`, `queueMicrotask`, search 250 ms, `reasoning` stripped) | Validates every API/stream payload via zod; curated error for initial-load vs stream; thinking indicator separate; controls disabled while `busy`; derived state out of `useState`; effects never `setState` sync | ☐ |
| E2 | Mobile drawer a11y | `cat src/components/navigation-frame.tsx` + `rg -n "NavigationFrame\|sidebar-close" src/` | Radix `Dialog.Root` + `Overlay asChild .mobile-scrim` + `Content asChild onCloseAutoFocus→[aria-label="Open navigation"]`; `.sidebar-close` inside drawer (backdrop aria-hidden) + `.collapse-button` hidden while open; WCAG axe on welcome/dialog/error | ☐ |
| E3 | Design tokens | `cat src/app/globals.css` + `cat postcss.config.mjs` | `@import "tailwindcss"`, `:root` tokens `--canvas/--sidebar/--mint/--green/--ink/--danger/--radius`, no `tailwind.config.js` found (`ls tailwind.config.*` → not found) | ☐ |
| E4 | Markdown safety | `rg -n "react-markdown\|remarkGfm" src/` | `a → target _blank rel noopener noreferrer`, `img → [Image: alt]` (no remote fetch), GFM tables | ☐ |

### Dimension F — API, Headers & Deployment Contracts (PAD §6–§8 + README)

| # | Check | Command / inspection | Expected observable | Done |
|---|-------|----------------------|---------------------|------|
| F1 | Route contracts (need running server) | `curl -s http://localhost:3000/api/health` + `curl -sI http://localhost:3000/api/conversations` + proxied `curl -H "Origin: https://x" -H "x-forwarded-host: x"` checks | `{"ok":true}` DB probe, `kimi_session=… HttpOnly; SameSite=strict` + `Cache-Control: no-store`, origin mismatches 403, null origin 403, empty content 400, missing key 503 curated copy; delete 409 while busy | ☐ |
| F2 | Security headers | `cat next.config.ts` + `curl -sI http://localhost:3000/` | `nosniff`, `DENY`, `HSTS 63072000 includeSubDomains`, `strict-origin-when-cross-origin`, `Permissions-Policy camera/microphone/geolocation=()`, `CSP frame-ancestors 'none'; base-uri 'self'; object-src 'none'` + route `no-store` + chat `X-Accel-Buffering: no` | ☐ |
| F3 | Docker & scripts | `cat docker-compose.yml` + `cat infrastructure/postgres/init/00-create-extensions.sql` + `cat scripts/{prune-expired,seed}.mjs` + `cat .env.example` | `postgres:17-alpine 5433:5432 chat_data+chat_net healthcheck 5s pg_isready`, `pgcrypto+pg_trgm`, `.mjs` with explicit `.ts` extensions + injected `{db,tables}`, DATABASE_URL example `5433/chat_db` | ☐ |
| F4 | CI pipeline | `cat .github/workflows/ci.yml` | `branches:[main]` + `pull_request`, `gates` = secret scan → typecheck → lint → test → build → audit, `e2e` with `postgres:17` service + `db:migrate` + build + `playwright chromium`, artifact on failure | ☐ |
| F5 | Troubleshooting coverage | README §Troubleshooting vs error strings in `src/` | Each row maps: `DATABASE_URL is required` (db/index.ts throw), health 500 (health route), "Connect NVIDIA" (chat 503), 429 lease, 403 x-forwarded-host (origin.ts) — fix actually resolves when reproduced | ☐ |

### Dimension G — Documentation Currency (the alignment audit itself)

| # | Check | Command / inspection | Expected observable | Done |
|---|-------|----------------------|---------------------|------|
| G1 | Tri-doc file-list consistency | Diff `AGENTS.md` §Architecture map vs `CLAUDE.md` §Architecture vs `README.md` §File hierarchy vs PAD §3.2 + §11 | All four docs name same `src/` files with same semantics after pass-3 remediations (origin.ts extraction, navigation-frame, incremental SSE, proxy-aware gate) | ☐ |
| G2 | Version drift | `rg -n "tailwind\|drizzle\|pg" package.json` vs README/PAD version tables | Only README minors behind (`pg 8.20` vs `8.23`, `Tailwind 4.1` vs `4.3.3`) — cosmetic, not functional | ☐ |
| G3 | PAD HEAD staleness | `git log --oneline -3` vs PAD header `HEAD verified: f888508` | PAD verified at `f888508`; HEAD is `8e44e28` (+3 commits: `298522b` skill distill, `8e44e28` prompts update, plus `cb8a05e` PAD itself) — PAD needs `HEAD verified` bump after this validation | ☐ |
| G4 | History & status rows | `docs/CODE_REVIEW_REPORT.md` Verification ledger + `README.md` §Project status recent changes vs `git log --oneline --since="2026-09-10"` | Pass-3 findings (C1/C2/H1/H2/M1/L1/L2 + I1-6) still open/closed correctly; critical rotations carried, CI fix landed, live outage resolved | ☐ |
| G5 | Reference material fencing | `cat tsconfig.json` (exclude) + `cat eslint.config.mjs` (globalIgnores) + `cat .gitignore` | `skills/`, `sample-build/`, `docs/` excluded from type/lint; `.env`/`ssh-key*.txt` ignored; `next-env.d.ts` ignored | ☐ |

---

## 5. Verification Gates (ALWAYS LAST — evidence, not prose)

Run **in order** per `AGENTS.md` Verification order (typecheck runs `next typegen` before `tsc` so route types can never be stale). Paste outputs.

### H1 — Type safety

```bash
npm run typecheck   # next typegen && tsc --noEmit, strict, no any/@ts-ignore
```
- **Expect:** `Generating route types… ✓ Types generated successfully` exit 0 (verified 2026-09-10).

### H2 — Lint

```bash
npm run lint        # eslint flat + next/core-web-vitals
```
- **Expect:** `0 problems` exit 0; `skills/sample-build/docs` excluded.

### H3 — Unit tests

```bash
npm test            # node --experimental-strip-types --test tests/*.test.mjs
```
- **Expect:** `15/15 pass` (core 8 — chat 2 + SSE 5 + provider 1 — + origin 7) ~350 ms, 0 fail.

### H4 — Production build

```bash
npm run build       # next build Turbopack
```
- **Expect:** `Compiled successfully` + `Finished TypeScript` + `Generating static pages (4/4)` + 6 routes (`○ /`, `○ /_not-found`, `ƒ /api/chat`, `ƒ /api/conversations`, `ƒ /api/conversations/[id]`, `ƒ /api/health`).

### H5 — Secret & dangerous-pattern scans (no build needed)

```bash
git grep -lIE 'nvapi-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}' -- src tests scripts drizzle
rg -n "eval\(|new Function|dangerouslySetInnerHTML|innerHTML|document\.write" src/
rg -n "NEXT_PUBLIC_" src/
```
- **Expect:** 0 hits in app code. Wider scan `git grep … -- . ':!package-lock.json' ':!skills/**' ':!sample-build/**' ':!docs/**'` also 0 (reference hits in `skills/trustskill` are docs-only, out of app scope).

### H6 — `.env` untracked proof

```bash
git ls-files | grep "^\.env$"          # expect exit 1 (not tracked)
git check-ignore -v .env               # expect .gitignore:10:.env
git ls-tree -r HEAD -- .env            # expect no output
ls -la .env                            # still present locally for dev
```
- **Expect:** Ignored but present locally; history still holds `7afe083` — rotation pending.

### H7 — Local E2E + WCAG (needs disposable DB + prod preview, no NVIDIA_API_KEY)

```bash
npm run db:migrate
npm run build && npm start &            # or bg_start with PORT=3004
TEST_BASE_URL=http://localhost:3004 npx playwright test tests/workspace.spec.ts tests/stream-ui.spec.ts
```
- **Expect:** `16 passed` (12 workspace including proxied-origin + mobile Escape + axe welcome/dialog/error + 4 stream-ui hermetic) + `12 skipped` live-site. If DB unavailable, mark deferred with reason.

### H8 — Live-site probe (optional, needs LIVE_SITE_URL)

```bash
curl -s https://kimi-chat.jesspete.shop/api/health          # expect {"ok":true}
curl -sI https://kimi-chat.jesspete.shop/api/conversations  # expect nosniff, DENY, HSTS, CSP, HttpOnly Strict Secure
LIVE_SITE_URL=https://kimi-chat.jesspete.shop npx playwright test tests/live-site.spec.ts
```
- **Expect:** Health 200 `{"ok":true}`; headers present; live suite 12/12 after redeploy of `d039d1e` proxy fix (pre-redeploy streaming test fails on 403 by design).

---

## 6. Current Project Status Snapshot (evidence at HEAD `8e44e28`, 2026-09-10)

| Area | Status | Evidence |
|------|--------|----------|
| **Git** | `main` up to date with `origin/main` @ `8e44e28` | `git log --oneline -7`: `8e44e28 Update prompts.md`, `298522b docs(skill): distill new-chat_SKILL.md`, `cb8a05e docs(pad): create Project_Architecture_Document.md v1.0`, `f888508 db evidence`, `6be7596 audit addendum`, `272d7ff untrack .env`; `git status -sb` → `## main...origin/main` clean (plus `?? oo1`) |
| **Gates (just re-run)** | ✅ Typecheck `✓ Types generated` · ✅ Lint (eslint, 0 problems) · ✅ Unit `15/15` · ✅ Build `Compiled in 11s, 6 routes` | Live `npm run typecheck/lint/test/build` outputs captured this session (see Live Validation Evidence in prior plan; re-run confirms no drift) |
| **Docs vs code drift** | **None material** except version cosmetics + PAD HEAD stamp | AGENTS arch map, CLAUDE principles, README hierarchy all reflect `origin.ts` + `navigation-frame.tsx` + incremental SSE; README `pg 8.20` vs `8.23` and `Tailwind 4.1` vs `4.3.3` are display-only; PAD `f888508` stamp lags HEAD by 2 doc commits |
| **Secrets** | ✅ App-code scans 0 hits; ✅ `.env` untracked & ignored (`git ls-files` clean, `git check-ignore .env → .gitignore:10:.env`); file still present locally | Broader tracked scan hits only `skills/trustskill` docs (reference material, excluded per AGENTS `tsconfig` fence); history still holds exposed keys — rotations pending |
| **Operational debt (carried)** | 🔴 C1 SSH key in `docs/ssh-key.txt` history + 🔴 C2 NVIDIA key in `.env` history (untracked at `272d7ff`, NVIDIA returns 403 "Authorization failed" → reads dead but rotation still advised) | `git log --all --oneline -- docs/ssh-key.txt` + `git log --oneline -- .env` history; files now untracked/ignored but git history retains them |
| **Redeploy required** | 🟠 `d039d1e` proxy-aware origin fix inert until prod redeploy (every browser `POST /api/chat` 403 behind Cloudflare until deployed) + 🟡 M1 live streaming test false-positive already hardened | `docs/CODE_REVIEW_REPORT.md` H1/M1; `LIVE_SITE_URL=… npx playwright test tests/live-site.spec.ts` should be 12/12 with real streamed answer after redeploy |
| **Build infra** | CI trigger `branches:[main]` repaired at `dc1c664`, secret scan + prod audit riding `gates` | `.github/workflows/ci.yml` `branches:[main]` + `pull_request`; `e2e` uses `postgres:17` service + `db:migrate` + build + chromium |
| **Untracked artifacts** | `oo1` (unknown, `??` in status) + `docs/session_1.md` + `docs/recent_code_changes_to_validate.txt` + new `docs/deep-*.md` plans + `sample-build/` `skills/` | `AGENTS.md` excludes `skills/sample-build/docs` from type/lint — safe; `oo1` disposition TBD (keep or `git clean -f`) |
| **Open backlog (I1–I6)** | I1 100-cap race (accepted), I2 429 lease coverage (backlog), I3 CSP nonce (deploy-time), I4 `workspace-polish.css` not adopted (deliberate), I5 Lighthouse deferred, I6 `npm prune` cron unscheduled | PAD §10 + CODE_REVIEW_REPORT I1-6; no code action needed this validation |

### PAD Validation Buckets (from `cb8a05e` review)

- **Bucket 1 confirmed green:** Docker Compose, `.env.example`, `drizzle.config.ts`, secret hygiene, health endpoint, chat route critical paths — all spec-compliant.
- **Bucket 2 minor doc drift:** Sibling values in skill vs PAD (`maxTokens` displayed 16_384 vs 8192 example) — non-blocking polish, not alignment failure.
- **Bucket 3 design intention preserved:** `new-chat_SKILL.md` derived from PAD with no drift from live `src/`.
- **PAD quality controls already passed:** every code block manually reviewed, non-existent paths rejected, TypeScript error fixed, DRY violation removed, version hallucination sanitized.

---

## 7. Risks & Mitigations

- **Ingress header trust:** `x-forwarded-host` is only trusted when the ingress is operator-controlled (Cloudflare/nginx). Mitigated by docs warning (`"Deploy only behind trusted HTTPS ingress … does not expose an untrusted proxy-header path"`) + `sec-fetch-site:cross-site` still rejected even with spoofed forwarded-host.
- **History-carried secrets:** `.env`/`ssh-key.txt` removal from tracking does not erase `7afe083`/`docs/ssh-key.txt` in history; same for embedded doc key. Mitigation is credential rotation at GitHub + NVIDIA console, not history rewrite without operator sign-off.
- **Concurrent 100-conversation cap:** `count → insert` can transiently exceed by 1 under race; accepted (self-inflicted, bounded, retention-corrects) — PAD I1.
- **PAD HEAD staleness:** PAD header `HEAD verified: f888508` now 2 doc commits behind `8e44e28` — low risk (doc-only commits) but should be bumped to `8e44e28` after this validation to keep "production-locked blueprint" claim truthful.
- **Stale validation snapshot:** `docs/recent_code_changes_to_validate.txt` stops at `eb654aa` — superseded by this plan; disposition needed (archive or remove).

---

## 8. Done-When & Next Action (requires your confirmation)

### Done when

- [ ] Every row in Dimensions A–G ticked with a cited file/line or command output — no doc claim left unverified.
- [ ] Gates H1–H8 all show ✅ with pasted command outputs (typecheck, lint, test, build, secret scans; E2E either ✅ or explicitly deferred with reason).
- [ ] No doc change required; or any drift is captured as a patch to `AGENTS.md`/`CLAUDE.md`/`README.md`/`Project_Architecture_Document.md` and re-verified (e.g., README `pg`/`Tailwind` version bump, PAD HEAD stamp to `8e44e28`).
- [ ] Live deployment status explicitly stated (deployed build hash vs HEAD, `/api/health` result, header snapshot).
- [ ] This plan file marked `[x]` per task as evidence accrues, and a one-page handoff summary produced.
- [ ] Untracked artifacts (`oo1`, stale `recent_code_changes_to_validate.txt`) disposition decided and executed.

### Next action — pick one

- **Option A — "approve read-only validation"**: Execute Dimensions A–G read-only checks + Gates H1–H6 locally (no DB, no E2E), tick this plan, and report the alignment verdict with evidence. No code/doc writes.
- **Option B — "approve full validation"**: Above plus H7 local E2E — provision a disposable PG (`docker compose up -d` → `db:migrate` → `build && start` → `TEST_BASE_URL=… npx playwright test`), then H8 live probe if `LIVE_SITE_URL` available.
- **Option C — "approve validation + drift polish"**: Full validation plus minimal drift patches — README version bumps (`pg 8.23`, `Tailwind 4.3.3`) and PAD `HEAD verified: 8e44e28` + Live Validation Evidence refresh, re-run gates, commit on `main`.

**Tell me which option to execute — I will not write code or mutate docs until you confirm.**

---

## Appendix — Live Validation Evidence (provisional, refreshed on execution)

| Gate | Command | Output (trimmed) | Verdict |
|------|---------|------------------|---------|
| Typecheck | `npm run typecheck` | `Generating route types… ✓ Types generated successfully` | ✅ |
| Lint | `npm run lint` | `eslint .` → 0 problems | ✅ |
| Unit | `npm test` | `15 pass, 0 fail` — `origin 7` + `core 8` (incl. SSE lone-CR/split-CRLF) | ✅ |
| Build | `npm run build` | `Compiled successfully in 11.0s`, 6 routes (`/`, `/_not-found`, `/api/chat`, `/api/conversations`, `/api/conversations/[id]`, `/api/health`) | ✅ |
| Secret app-code | `git grep -lIE 'nvapi-…' -- src tests scripts drizzle` | 0 hits | ✅ |
| Secret tracked | `git grep … -- . ':!package-lock.json' ':!skills/**' ':!sample-build/**' ':!docs/**'` | 0 hits | ✅ |
| Dangerous | `rg eval\|NEXT_PUBLIC_ src/` | 0 hits in `src/` | ✅ |
| Owner isolation | `rg eq\(conversations.owner src/` | Every conversation query filtered by `owner` | ✅ |
| Origin gate | `rg isSameOriginRequest src/` | Pure `src/lib/origin.ts:9`, used via `src/lib/server.ts:61` + 7 unit tests | ✅ |
| `.env` | `git ls-files \| grep "^\.env$"` → exit 1; `git check-ignore -v .env` → `.gitignore:10:.env` | Ignored but present locally | ✅ |
| H7 E2E | *(to run on approval)* | *expect 16 passed /12 skipped* | ⏳ |
| H8 Live | *(to run if LIVE_SITE_URL set)* | *expect 12/12 after redeploy* | ⏳ |

