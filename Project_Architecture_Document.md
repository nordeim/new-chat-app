# Kimi Workspace — Master Project Architecture Document (PAD) v1.0

**Classification:** Internal Engineering Reference
**Status:** DEFINITIVE, PRODUCTION-LOCKED BLUEPRINT
**Companion Documents:** `README.md` (user-facing), `AGENTS.md` (agent ops), `CLAUDE.md` (AI instructions), `docs/CODE_REVIEW_REPORT.md` (audit ledger)
**Last Updated:** 2026-09-10
**Audience:** Senior Engineers, Tech Leads, DevOps, Onboarding Engineers, AI Coding Agents
**Rule:** Every architectural decision traces to a specific rationale. Nothing is here "because it's popular."
**Repository:** `nordeim/new-chat-app` · **Branch:** `main` · **HEAD verified:** `f888508`

#### Revision Block — v1.0 (Tracked Changes)

Every change tagged with source: `[RES]` = web research, `[SR]` = self-review, `[CA]` = critical analysis, `[SYN]` = synthesis, `[SAN]` = sanitization, `[AUTH]` = auth alignment, `[VAL]` = live validation.

- `[SYN, VAL]` v1.0 — Initial PAD generated from live codebase at `f888508` (PostgreSQL 17 rebuild validated, `npm run db:migrate → build → TEST_BASE_URL=3004 npx playwright test → 12 skipped, 16 passed`). All sections grounded in file-level evidence, no speculative versions.

---

## Table of Contents

1. [System Overview & Decisions](#1-system-overview--decisions)
   - 1.1 Document Metadata & Purpose
   - 1.2 Technology Stack Summary
   - 1.3 Architecture Decision Records (ADRs)
2. [High-Level System Topology](#2-high-level-system-topology)
3. [Application Architecture](#3-application-architecture)
   - 3.1 The Layer Model (Golden Rule)
   - 3.2 Annotated Directory Structure
   - 3.3 Critical Code Patterns
4. [Data Architecture](#4-data-architecture)
5. [Design System Reference](#5-design-system-reference)
6. [Security Architecture](#6-security-architecture)
7. [Testing Strategy](#7-testing-strategy)
8. [Build & Deployment](#8-build--deployment)
9. [Developer Handbook](#9-developer-handbook)
10. [Known Issues & Outstanding Tasks](#10-known-issues--outstanding-tasks)
11. [Key Files Reference](#11-key-files-reference)
12. [Glossary](#12-glossary)

---

## 1. System Overview & Decisions

### 1.1 Document Metadata & Purpose

**What this PAD is:** The single source of truth for Kimi Workspace — a calm, mint-accented, production-grade chat workspace that streams NVIDIA NIM `moonshotai/kimi-k3` responses via OpenAI-compatible SSE, persists conversations in PostgreSQL via Drizzle ORM, and isolates workspaces by browser-session cookie. It captures *what* the system is, *why* each decision was made, and *how* every component fits together — so a new engineer, an operator, or an AI agent can understand, extend, debug, or replicate the project without tribal knowledge.

**Relationship to companion docs:**

| Doc | Role | This PAD's stance |
|-----|------|-------------------|
| `README.md` | User-facing quick-start, features, troubleshooting | PAD is the engineering blueprint; README is the onboarding ramp — PAD never duplicates API curl examples as spec |
| `AGENTS.md` | Agent ops: commands, env, architecture map, non-obvious rules | PAD is the rationale behind every rule in AGENTS; AGENTS is the checklist, PAD is the reasoning |
| `CLAUDE.md` | AI coding standards + six-phase workflow | PAD is the artifact that the six-phase workflow produces |
| `docs/CODE_REVIEW_REPORT.md` | Tiered audit ledger (pass 3 at `eb654aa..6be7596`) | PAD is the *current* architecture; the report is the *history* of how it got here |

**How to use by audience:**

- **New engineer:** Read §1.2 (stack) → §2 (topology) → §3.1 (layer model) → §3.2 (dir tree) → §9.1 (local setup). You will know where to make a change before you touch a file.
- **Debugging:** Jump to §3.3 (critical patterns — lease, SSE, origin gate), §4 (data), §6 (security), §7 (tests) — each pattern lists its invariant and failure surface.
- **Reviewing tech choices:** §1.3 ADRs — every consequential choice has Context/Decision/Rationale/Consequences/Alternatives Rejected.
- **AI agent:** Treat this PAD as the authoritative context window. When `AGENTS.md` says “consult `CODE_REVIEW_REPORT.md` before planning,” consult this PAD first for the *current* shape.

### 1.2 Technology Stack Summary

No speculative “e.g.” — every entry is locked and verified against `package.json`, `drizzle.config.ts`, `next.config.ts`, lockfile, and live `docker-compose.yml`.

| Layer | Technology | Version | Key Rationale |
|-------|------------|---------|---------------|
| **Web Framework** | Next.js (App Router) | `16.3.4` (Turbopack) | App Router route handlers (`src/app/api/*`) give per-route `runtime = "nodejs"` + `maxDuration = 600` for SSE; file-based routing eliminates manual router config; `next typegen` keeps route params typed (runs before `tsc`). Chosen over Remix/SvelteKit because RSC streaming + Turbopack + Vercel-grade headers fit this SSE-heavy app. |
| **UI Runtime** | React | `19.3.0` + `react-dom 19.3.0` | Single client component (`chat-workspace.tsx`) with explicit loading/error/empty/success states; React 19 form/event refinements without external state lib. |
| **Language** | TypeScript (strict) | `5.9.3` (`strict: true`, `noEmit: true`, `isolatedModules: true`, `esModuleInterop: true`, `target: ES2017`, `module: esnext`, `moduleResolution: bundler`) | `strict` + `no any` + zod at boundaries eliminates runtime type drift; `isolatedModules` keeps `node --experimental-strip-types` viable for unit tests. |
| **Styling** | Tailwind CSS (CSS-first) + PostCSS | `4.3.3` + `@tailwindcss/postcss 4.3.3`, `postcss 8.5.28` | CSS-first `@theme` in `src/app/globals.css` — tokens (`--mint`, `--green`, `--canvas`) are design-system single source; no `tailwind.config.js` to drift. Chosen over CSS modules because mint palette + Radix + single component benefit from token reuse. |
| **Component Primitives** | Radix UI Dialog | `@radix-ui/react-dialog 1.1.23` | Only outside primitive: wraps mobile sidebar as modal dialog (focus containment, Escape, focus restore). Chosen over Headless UI because `asChild` + `onCloseAutoFocus` control fits `NavigationFrame` pattern exactly. |
| **Validation** | zod | `4.6.1` | Single home `src/lib/validation.ts` for all schemas (`chatInputSchema`, `titleSchema`, `idSchema`, `providerChunkSchema`, `imageSchema`); shared server + client + unit tests; `safeParse` at every boundary. |
| **Data / ORM** | Drizzle ORM + `pg` | `drizzle-orm 0.45.2`, `pg 8.23.0`, `drizzle-kit 0.31.10`, `pg` Pool cached on `globalThis` in dev | Parameterized queries only, JSONB `messages` storage, versioned SQL migrations in `drizzle/` (journal-driven). Chosen over Prisma because SQL stays explicit (e.g., `jsonb_array_elements` search) and `pg` Pool lifecycle is controllable. |
| **Database** | PostgreSQL | `17-alpine` (local), `14+` supported | `chat_sessions` + `conversations` with FK cascade, `pgcrypto` for `gen_random_uuid()`, `pg_trgm` for future fuzzy search. Volume `chat_data`, healthcheck `pg_isready -U chat_user -d chat_db` every 5s. |
| **AI Provider** | NVIDIA NIM (OpenAI-compatible) | endpoint `https://integrate.api.nvidia.com/v1/chat/completions`, model `moonshotai/kimi-k3`, `stream: true`, `Accept: text/event-stream` | Server-only `NVIDIA_API_KEY` (never `NEXT_PUBLIC_`); reasoning `max` by default, `temperature 1`, `max_tokens 16384`; image via `image_url` blocks; `reasoning_content` persisted for multi-turn but stripped from browser. |
| **Testing — Unit** | `node:test` + `node --experimental-strip-types` | Node ≥22 required | No extra runner; `.mjs` imports `.ts` directly with explicit `.ts` extensions; fast (22 tests ~300 ms). |
| **Testing — E2E / WCAG** | Playwright + `@axe-core/playwright` | `@playwright/test 1.63.0`, `@axe-core/playwright 4.13.0` | `workspace.spec.ts` (CRUD, isolation, search, retention, WCAG), `stream-ui.spec.ts` (hermetic), `live-site.spec.ts` (gated by `LIVE_SITE_URL`). Single worker, 60 s timeout, `reuseExistingServer: true`. |
| **Build Tooling** | Next.js Turbopack + `next typegen` + `tsc` + ESLint flat | `eslint 9.39.5`, `eslint-config-next 16.3.4` | `npm run typecheck` = `next typegen && tsc --noEmit` so route types can never be stale; `eslint.config.mjs` globalIgnores `skills/sample-build/docs`. |
| **Infra — Local** | Docker Compose + `pg 17-alpine` + named volume | `chat_data` + `chat_net` bridge | `5433:5432` avoids host `5432` clash with Scandi Haven; healthcheck 10 retries; init script `infrastructure/postgres/init/00-create-extensions.sql`. |
| **CI** | GitHub Actions + `postgres:17` service | Node 22, `cache: npm`, `npm ci` | Two jobs: `gates` (secret scan → typecheck → lint → test → build → `npm audit --omit=dev`) + `e2e` (service PG, `db:migrate`, build, `playwright install chromium --with-deps`). `branches: [main]` + `pull_request`. |
| **Icons / Markdown** | `lucide-react 1.43.0`, `react-markdown 10.1.0`, `remark-gfm 4.0.1` | — | `lucide-react` for workspace chrome; `react-markdown` with `a → target="_blank" rel="noopener noreferrer"`, `img → [Image: alt]` sanitization; GFM tables. |

### 1.3 Architecture Decision Records (ADRs)

**ADR-001: Next.js 16 App Router over SPA-only Vite/Remix**

- **Context:** Need per-route streaming (`text/event-stream` with `maxDuration 180`), server-only secrets, typed route params, and security headers that travel with the build. Pure SPA would need a separate API server.
- **Decision:** Next.js 16 App Router, `runtime = "nodejs"` on `src/app/api/chat/route.ts`, `dynamic = "force-dynamic"` on `conversations` routes, `next.config.ts` headers (nosniff, DENY, HSTS, CSP).
- **Rationale:** App Router gives colocated `route.ts` handlers with `NextRequest`/`NextResponse`, streaming `ReadableStream<Uint8Array>` without a custom server, and `next typegen` for route safety. Verified: `npm run build` outputs 6 routes (`○ /`, `○ /_not-found`, `ƒ /api/chat`, `ƒ /api/conversations`, `ƒ /api/conversations/[id]`, `ƒ /api/health`).
- **Consequences:** + Single deployable, + headers versioned with code; − Turbopack + `globalThis` Pool cache adds dev-only complexity.
- **Alternatives Rejected:** Vite SPA + Express API (two deploys, SSE proxy complexity); Remix (excellent, but Next `maxDuration` + `next typegen` better fit this SSE workload).

**ADR-002: Drizzle ORM + `pg` over Prisma**

- **Context:** Need JSONB `messages` with server-side search (`jsonb_array_elements → ILIKE`), FK cascade deletes, and explicit control over Pool lifecycle for E2E `FOR UPDATE` transactions.
- **Decision:** `drizzle-orm 0.45.2`, `drizzle-kit 0.31.10`, `pg 8.23.0`, `pg.Pool` cached on `globalThis` in dev (`src/db/index.ts`), `drizzle.config.ts` reads `DATABASE_URL` via `dotenv/config` (single source, no hard-coded URL), journal `drizzle/meta/_journal.json` + SQL `drizzle/0000_flimsy_sage.sql`.
- **Rationale:** Drizzle keeps SQL explicit (`sql` template for `ilike` + `jsonb_array_elements` with wildcard escaping `\ % _`), migrations are plain SQL reviewable in PRs, Pool is controllable for `transaction(async tx => FOR UPDATE)` in delete. Verified: `npm run db:migrate` → `[✓] migrations applied`, `npm run db:seed` → `{inserted:1}` then `{inserted:0}` idempotent.
- **Consequences:** + No codegen, + SQL is the migration artifact; − Manual `searchPattern` escaping required.
- **Alternatives Rejected:** Prisma (strong DX, but `jsonb` search + raw `FOR UPDATE` ergonomics weaker; extra codegen step).

**ADR-003: SHA-256 Session Cookie over JWT/Auth.js**

- **Context:** This is a *browser-session workspace*, not an enterprise identity system. Need isolation per browser without durable user accounts, account recovery, or RBAC — yet every conversation query must be owner-scoped and the cookie must never leak owner identity.
- **Decision:** `kimi_session` 64-hex token (`randomBytes(32).toString("hex")`), stored HttpOnly `SameSite=strict`, `Secure` when `https` or `x-forwarded-proto: https`, `Max-Age 30 days`; only `SHA-256(token)` stored as `sessions.id` (`owner`). Every `conversations` query filters by `owner`; writes run `requireSession()` or `ensureSession()` + `onConflictDoNothing`.
- **Rationale:** No JWT signing/rotation, no session table bloat beyond one row per browser, no PII. `sessionId()` validates `^[a-f0-9]{64}$` and throws 401 with curated copy on expiry. Verified: `curl /api/conversations` sets `kimi_session=… HttpOnly; SameSite=strict`; cross-session read → 404 (E2E two contexts).
- **Consequences:** + Minimal, + clearing cookie loses workspace (documented); − Not SSO-capable — “Before public deployment” checklist requires durable auth + RBAC.
- **Alternatives Rejected:** Auth.js v5 / Better Auth (correct for SaaS with users, overkill for session workspace; would add OAuth, account tables, and migration complexity).

**ADR-004: Pure Same-Origin Gate via `x-forwarded-host` (proxy-aware)**

- **Context:** Live deployment behind Cloudflare rewrites `Host` to upstream; `assertOrigin` compared only `Origin.host === Host` so every browser `POST /api/chat` returned 403 (“This action must be made from your chat workspace.”) despite correct `Origin`. Verified live: `curl Origin=https://kimi-chat.jesspete.shop` → 403 pre-fix, `x-forwarded-proto: https` present via `Secure` cookie.
- **Decision:** Extract `isSameOriginRequest(origin, host, forwardedHost, secFetchSite)` in `src/lib/origin.ts` — accepts when `url.host === host || url.host === firstForwardedHost` (first value of comma-chain), rejects `sec-fetch-site: cross-site`, malformed `Origin`, non-`http(s)` schemes. Kept free of `next/headers`/`pg` so `node:test` can import it. `src/lib/server.ts: assertOrigin` delegates. 7 unit tests + API regression test (`POST` with rewritten Host + `x-forwarded-host` → 400 not 403; mismatched origin → 403).
- **Rationale:** Cloudflare/nginx/ALB forward public host as `x-forwarded-host` by convention; browsers cannot forge `Origin`/`sec-fetch-site`; direct attackers can spoof `Host` anyway so matching `Host` was never the CSRF boundary. Security envelope unchanged: cross-site still fails both checks. Verified: `npm test` 7/7 origin, `TEST_BASE_URL=http://localhost:3004 npx playwright test -g "x-forwarded-host"` green.
- **Consequences:** + Production chat works behind TLS ingress; − Operator must preserve public Host or forward `x-forwarded-host` (README troubleshooting documents 403 failure mode).
- **Alternatives Rejected:** `Host`-only check (broken behind ingress); `Referer` check (weaker than `Origin` + `sec-fetch-site`).

**ADR-005: Incremental SSE Parser (LF/CRLF/CR, split-CRLF, exactly-one-space)**

- **Context:** Provider streams via `Accept: text/event-stream`; networks split chunks arbitrarily, SSE spec allows LF, CRLF, or lone CR, and `data:` may have exactly one space stripped. Buffer-concatenation parser depended on chunk size and mishandled lone-CR / split CRLF / size accounting.
- **Decision:** `src/lib/sse.ts` `SSEParser` with `fragments/lineLength/data/dataLength/skipLF`, LF/CRLF/CR branch, `skipLF` for CRLF split across `push()` calls, `data:` exactly-one-space (`slice(5===" "?6:5)`), multiline `data` joined `\n`, incremental `MAX 1_000_000` checks for line+event, `finish()` as `push("\n\n")`. Shared by server (`route.ts`) and client (`chat-workspace.tsx`). Unit tests: lone-CR `data: one\rdata: two\r\r`, split-CRLF `data: A\r` + `\ndata: B\r\n\r\n`, comment `": ping"`, `data:no-space` vs `data:  two-spaces` (keeps one), incremental size rejects.
- **Rationale:** Adopted from `sample-build/src/lib/sse.ts` canonical incremental scanner; limits no longer depend on chunk boundaries. Verified: `npm test` 5 SSE/validation suites green; `npm run build` → `Compiled successfully`.
- **Consequences:** + Parity with SSE spec, + both sides share one parser; − Slightly more state than naive `split("\n\n")`.
- **Alternatives Rejected:** Keep naive parser (fails on lone-CR hosts / split CRLF); per-side parsers (drift risk).

**ADR-006: Radix Dialog Mobile Drawer over CSS-only scrim**

- **Context:** Mobile navigation must trap focus, close on Escape, and restore focus to the opener (`[aria-label="Open navigation"]`) while keeping the close affordance accessible when the backdrop is `aria-hidden` (Radix hides Overlay from AT).
- **Decision:** `src/components/navigation-frame.tsx` — when `open` is false, renders `children` in place; when true, renders `Dialog.Root` with `Overlay asChild` button `.mobile-scrim` (`aria-label="Close navigation"`) and `Content asChild` with `onCloseAutoFocus` → focus opener. `.sidebar-close` button lives *inside* drawer (visible only while `mobile-open`), `.collapse-button` hidden in that state. `src/app/globals.css` adds `.mobile-scrim`/`.dialog-overlay`/`.dialog-content` tokens.
- **Rationale:** Radix gives focus containment + Escape + focus restore for free; `asChild` keeps the existing `aside.sidebar` markup. Verified: `workspace.spec.ts` `mobile navigation closes on Escape and restores focus` + `mobile navigation and composer fit viewport` (no `documentElement.scrollWidth > innerWidth`) + axe WCAG on welcome/dialog/error pass.
- **Consequences:** + WCAG-compliant drawer, + no extra deps beyond `@radix-ui/react-dialog`; − Radix hides backdrop from AT, so in-drawer close button is mandatory.
- **Alternatives Rejected:** CSS-only scrim + manual focus trap (re-implements Radix correctly with more risk).

**ADR-007: Tailwind CSS v4 CSS-first @theme over `tailwind.config.js`**

- **Context:** Design system is mint-calm, editorial, with well-defined tokens (`--canvas`, `--sidebar`, `--mint`, `--green`, `--green-dark`, `--focus`, `--danger`, `--ink`/`--muted`/`--subtle`, `--radius 14px`) — need single source without config drift.
- **Decision:** No `tailwind.config.js`; `@import "tailwindcss"` in `src/app/globals.css` with `:root` tokens + component styles. `postcss.config.mjs` wires `@tailwindcss/postcss`. `tsconfig` + `eslint.config.mjs` exclude non-app material (`skills/`, `sample-build/`, `docs/`).
- **Rationale:** CSS-first tokens are co-located with component styles; reuse via `var(--mint)` etc., no JS config to misalign. Verified: `npm run build` avoids config missing warning; `globals.css` ~1500 lines is the design-system artifact.
- **Consequences:** + One place for tokens; − v4 migration requires reading v4 deep-dive (done per `avant-garde-design-v4` refs).
- **Alternatives Rejected:** `tailwind.config.js` (extra indirection; v4 CSS-first is the idiomatic path for `@theme` tokens).

---

## 2. High-Level System Topology

### 2.1 Topology Diagram

```mermaid
flowchart TB
  subgraph Client["Browser Workspace (React 19, Tailwind v4)"]
    UI["chat-workspace.tsx (single client component)"]
    NF["navigation-frame.tsx (Radix dialog when mobileOpen)"]
    SSEc["SSEParser (client-side delta/thinking/done/error)"]
  end

  subgraph Edge["TLS Ingress (Cloudflare / nginx / ALB)"]
    TLS["HTTPS termination\nPreserve public Host OR forward x-forwarded-host\nForward x-forwarded-proto: https"]
  end

  subgraph App["Next.js 16 App Router (Node.js 22+, Turbopack)"]
    CHAT["POST /api/chat\nruntime=nodejs, maxDuration=180\norigin→session→zod→magic-byte→lease→upsert→NVIDIA SSE→persist final only"]
    CONV["GET /api/conversations (?q= search)\nGET /api/conversations/[id]\nPATCH /api/conversations/[id] (rename)\nDELETE /api/conversations/[id] (FOR UPDATE)"]
    HEALTH["GET /api/health\nselect 1 probe\nno provider key"]
    ORIGIN["lib/origin.ts isSameOriginRequest\npure, unit-testable"]
    SSEs["lib/sse.ts SSEParser\nshared server+client"]
  end

  subgraph Data["PostgreSQL 17 (chat_db)"]
    SESS["chat_sessions(id text PK, busyUntil, lastRequest)"]
    CONVS["conversations(id uuid PK, owner→sessions.id cascade,\ntitle, messages jsonb ChatMessage[], updatedAt)"]
    IDX["Index: conversations_owner_updated_idx\n(owner, updatedAt)"]
  end

  subgraph Ext["External"]
    NIM["NVIDIA NIM\nhttps://integrate.api.nvidia.com/v1/chat/completions\nmoonshotai/kimi-k3, stream, reasoning_content"]
    EXTERNAL["No third-party script origins\n— CSP deliberately minimal (frame-ancestors, base-uri, object-src)"]
  end

  UI -->|"POST /api/chat (SSE)\nOrigin + sec-fetch-site"| TLS
  TLS -->|Host / x-forwarded-host| CHAT
  CHAT -->|"zod + magic-byte + lease\n(3 s spacing, 195 s expiry)"| CONVS
  CHAT <-->|"OpenAI-compatible SSE\nAccept: text/event-stream"| NIM
  CHAT -->|"persist final answer only\n(JSONB)"| CONVS
  CHAT -->|"meta/thinking/delta/done/error"| SSEc
  CONV --> CONVS
  HEALTH --> SESS
  ORIGIN -.-> CHAT
  SSEs -.-> CHAT
  SSEs -.-> SSEc
  IDX -.-> CONVS
```

### 2.2 Runtime & Scaling Notes

| Layer | Runtime | Scaling | Key Constraint |
|-------|---------|---------|----------------|
| Browser | React 19 client component + Radix + zod | N browsers; no server state per tab beyond cookie | Must handle loading/error/empty/success; disable controls while `busy`; no `setState` in effects |
| TLS Ingress | Cloudflare/nginx/ALB (operator) | Horizontally | **Must** preserve public `Host` or forward `x-forwarded-host`; otherwise origin gate 403s every browser write (README troubleshooting) |
| App Router | Next.js 16 `node` runtime, `maxDuration 180` on `/api/chat`, Pool cached on `globalThis` in dev | Single region primary; stateless handlers + DB lease for concurrency | One generation per session enforced by atomic `UPDATE … WHERE busyUntil < now() AND lastRequest < now-3s RETURNING`; lease 195 s, provider timeout 175 s, spacing 3 s |
| Data | `postgres:17-alpine`, `chat_data` volume, `chat_net` bridge, `5433:5432` | Single primary; index `owner,updatedAt` for list/search | `pgcrypto` for `gen_random_uuid()`, `pg_trgm` pre-installed for future fuzzy search; retention via `pruneIdleSessions` / `pruneStaleConversations` (no cron yet) |
| Provider | NVIDIA NIM `kimi-k3`, Bearer `NVIDIA_API_KEY` server-only | External quota/billing; no automatic retries | Streaming integrity: only `completed && assistant.content` path persists; `reasoning_content` persisted then stripped; `Content exceeded size limit` throws at 1 200 000 chars |

---

## 3. Application Architecture

### 3.1 The Layer Model (Golden Rule)

```
Layer 0: Edge — TLS ingress.  Rule: Preserve public Host OR set x-forwarded-host to the public host. Do not expose an untrusted proxy-header path.
Layer 1: App Router — Next.js route handlers.  Rule: Every handler is owner-scoped; writes require isSameOriginRequest + requireSession/ensureSession; reads are owner-filtered. No handler touches provider internals directly except POST /api/chat.
Layer 2: Domain — src/lib (origin, server, validation, sse, types) + src/db (schema, index).  Rule: Boundaries validate with zod; origin is pure (no Next/DB imports); SSE is shared; types are single source; DB is parameterized Drizzle only.
Layer 3: Features — src/components (chat-workspace, navigation-frame).  Rule: One client component owns the workspace; it validates every API/stream payload with zod via apiJson/parseOrReload; derived state stays out of useState; effects never setState synchronously.
Layer 4: Persistence — PostgreSQL via pg.Pool.  Rule: Migrations are journal-driven SQL; seed is idempotent; retention is pure functions taking {db,tables,options}.
```

**Golden Rule:** *Server is the authority.* Every limit, ownership check, and validation is enforced server-side; the client mirrors for UX only. No silent failure: curated user-facing copy + structured JSON logs (`operation`/`ids`/`errorType`, never message content/cookies/keys). Streaming integrity: only complete provider answers are persisted; partial/failed streams surface explicit errors and stay retryable.

### 3.2 Annotated Directory Structure

```
new-chat-app/
├── .env                          # Local only — untracked, gitignored — DATABASE_URL + optional NVIDIA_API_KEY (never commit)
├── .env.example                  # Committed template — DATABASE_URL=postgresql://chat_user:chat_secret@127.0.0.1:5433/chat_db
├── .github/workflows/ci.yml      # CI: Node 22, npm ci → secret scan (nvapi-|PRIVATE KEY|ghp_|AKIA) → typecheck → lint → test → build → audit → e2e (postgres:17 service, db:migrate, build, playwright chromium)
├── .gitignore                    # .next, node_modules, .env, skills/sample-build/docs excluded from app type/lint
├── AGENTS.md                     # Agent ops — commands, env, architecture map, non-obvious rules, links to CODE_REVIEW_REPORT.md
├── CLAUDE.md                     # AI instructions — six-phase workflow, project principles, error handling, anti-patterns
├── README.md                     # User-facing — features, architecture mermaid, quick-start, docker, env vars, API ref, data/security, testing, design tokens, troubleshooting
├── Project_Architecture_Document.md ← YOU ARE HERE — single source of truth (this file)
├── docker-compose.yml            # postgres:17-alpine, chat_db/chat_user/chat_secret, 5433:5432, chat_data volume, healthcheck, init pgcrypto+pg_trgm
├── drizzle.config.ts             # dotenv/config, DATABASE_URL required, schema ./src/db/schema.ts, out ./drizzle, verbose+strict
├── drizzle/                      # Versioned SQL — journaled migrations (generate → migrate)
│   ├── 0000_flimsy_sage.sql      # CREATE chat_sessions, conversations, FK cascade, index owner_updated
│   └── meta/                     # _journal.json + 0000_snapshot.json
├── eslint.config.mjs             # Flat config, next/core-web-vitals, globalIgnores .next/out/build/next-env.d.ts/skills/sample-build/docs
├── infrastructure/postgres/init/00-create-extensions.sql ← pgcrypto + pg_trgm (IF NOT EXISTS, runs once on first docker entrypoint)
├── next.config.ts                # headers: nosniff, DENY, HSTS max-age=63072000 includeSubDomains, strict-origin-when-cross-origin, permissions-policy, CSP frame-ancestors 'none'; base-uri 'self'; object-src 'none'
├── next-env.d.ts                 # Auto-generated by next typegen
├── package.json                  # Scripts: dev/build/start/lint/typecheck (next typegen + tsc)/test/test:e2e/db:generate|migrate|seed/prune; deps: next 16.3.4, react 19, drizzle-orm, pg, zod, lucide-react, react-markdown, radix-dialog; dev: tailwindcss 4, playwright, axe-core, drizzle-kit, typescript
├── playwright.config.ts          # baseURL TEST_BASE_URL ?? localhost:3000, workers 1, fullyParallel false, timeout 60s, chromium, webServer npm start when TEST_BASE_URL unset (reuseExistingServer true), trace retain-on-failure
├── postcss.config.mjs            # @tailwindcss/postcss
├── scripts/
│   ├── prune-expired.mjs         # CLI wrapper for retention — --idle-days 30 [--conversation-days 90], logs {operation:"retention.prune",idleDays,conversationDays,sessionsDeleted,conversationsDeleted}
│   └── seed.mjs                  # CLI wrapper for seed — injected {db,tables}, logs {operation:"db.seed",inserted}
├── src/
│   ├── app/
│   │   ├── globals.css           # CSS-first @theme tokens (--canvas #fcfdfb, --sidebar #f5f7f3, --mint #e8f0e2, --green #306345, etc.) + component styles + dialog/mint/canvas/scrim styles, @import "tailwindcss"
│   │   ├── layout.tsx            # <html lang="en"> + metadata.title "Kimi — A little more possible"
│   │   ├── page.tsx              # Renders <ChatWorkspace />
│   │   └── api/
│   │       ├── chat/route.ts     # 350 lines — origin→session→zod→magic-byte→atomic lease (3 s / 195 s)→upsert (duplicate-retry guard)→NVIDIA fetch (SSE parse, providerChunkSchema)→persist final only→SSE to browser (meta/thinking/delta/done/error) + AbortSignal 175 s + release lease
│   │       ├── conversations/
│   │       │   ├── route.ts      # GET — ensureSession, ?q= search (title ILIKE + jsonb_array_elements→content ILIKE, escaped \ % _, owner-filtered, ILIKE, limit 100, desc updatedAt, returns {conversations,configured}, sets kimi_session cache-control no-store
│   │       │   └── [id]/route.ts # GET (strip reasoning) / PATCH (title 1–100, no-store cache) / DELETE (transaction FOR UPDATE on sessions where busyUntil < now, else 409) — all owner-scoped via identity()
│   │       └── health/route.ts   # GET — db.execute(select 1) → {ok:true} / {ok:false} 500 — no provider key
│   ├── components/
│   │   ├── chat-workspace.tsx    # ~1500 lines — single client component: categories (write/code/idea/image), starter prompts, composer (draft, attachment 2 MB PNG/JPEG/WebP, temperature/reasoningEffort/maxTokens), stream handling (SSEParser, streamEventSchema, meta→delta→done/error), history (search ⌘K debounced 250 ms, server ?q= then local), rename/delete (PATCH/DELETE), export markdown, reading/error/empty states, toast, mobile drawer via NavigationFrame, a11y focus, react-markdown + remark-gfm (a→target _blank, img→[Image])
│   │   └── navigation-frame.tsx  # 46 lines — Radix dialog wrapper when mobileOpen: Overlay asChild .mobile-scrim + Content asChild + onCloseAutoFocus → [aria-label="Open navigation"]
│   ├── db/
│   │   ├── index.ts              # pg Pool (globalThis cache in dev) + drizzle(pool) — throws if DATABASE_URL missing (kills every API route; nothing runs without DB)
│   │   ├── schema.ts             # pgTable chat_sessions (id text PK, busyUntil, lastRequest) + conversations (id uuid PK gen_random_uuid, owner text FK cascade, title, messages jsonb ChatMessage[] default [], createdAt/updatedAt, index owner_updated)
│   │   └── seed.ts               # Idempotent seed — injected {db,tables}, no PII, safe to re-run
│   └── lib/
│       ├── origin.ts             # Pure isSameOriginRequest(origin,host,forwardedHost,secFetchSite) — unit-testable, no Next/DB imports
│       ├── retention.ts          # Pure pruneIdleSessions / pruneStaleConversations taking {db,tables,options} (no @/ aliases, no relative runtime imports) — consumed by scripts/prune-expired.mjs
│       ├── server.ts             # Cookie session (kimi_session 64-hex, SHA-256 owner), ensureSession/sessionId/requireSession, assertOrigin, readJson (3 MB bounded, 415/413/400), errorResponse (ApiError 4xx vs 500 + requestId log), setSession (HttpOnly Strict, Secure via https|x-forwarded-proto)
│       ├── sse.ts                # SSEParser — LF/CRLF/CR, split-CRLF skipLF, data: exactly-one-space, multiline join \n, incremental 1M limits, finish()
│       ├── types.ts              # ChatMessage (id, role user|assistant, content, image?, reasoning?), ConversationSummary, ChatSettings, defaultSettings (temp 1, maxTokens 16384, reasoningEffort max)
│       └── validation.ts         # imageSchema (2_800_000, png|jpeg|webp data-uri), chatInputSchema (conversationId uuid?, content 1-16000 trimmed, image?, settings strict), titleSchema (1-100), idSchema uuid, providerChunkSchema (reasoning_content)
├── tests/
│   ├── core.test.mjs             # node:test — chatInputSchema, titleSchema, SSE LF/CRLF/CR + split-CRLF + comment + size-limit, providerChunkSchema, history grouping, formatRelativeTime, getNodeText, workspaceLoadError
│   ├── origin.test.mjs           # node:test — isSameOriginRequest 7 tests (direct, proxied, chained x-forwarded-host, http/https vs ftp, cross-site, missing/malformed, mismatch)
│   ├── workspace.spec.ts         # Playwright — welcome/prompt starters/settings, missing-key UX, image attach/remove, mobile viewport + Escape restore, WCAG via axe, CRUD isolation (two contexts), API 400/403, x-forwarded-host regression, ?q= search (title+content, owner-isolated), search dialog (xylophone), retention (idle cascade + stale)
│   ├── stream-ui.spec.ts         # Hermetic — mocked APIs, streamed answer + GFM table + error state WCAG + non-JSON friendly copy
│   └── live-site.spec.ts         # Gated LIVE_SITE_URL — title/welcome/console, starters, settings, search, mobile overflow, WCAG, health/session cookie/cross-origin/invalid id/session isolation, provider streaming (assistant-nonce only, error banner text, Copy + persistence)
├── sample-build/                 # Reference build (uploaded) — NOT app code, excluded from tsconfig/eslint; source of SSE incremental scanner + NavigationFrame pattern; workspace-polish.css deliberately not adopted
├── skills/                       # Reference material — NOT app code, excluded from tsconfig/eslint
├── docs/                         # Reference + audit — NOT app code, excluded; CODE_REVIEW_REPORT.md is the audit ledger
└── tsconfig.json                 # target ES2017, jsx react-jsx, strict, noEmit, bundler, isolatedModules, baseUrl ., paths @/* → src/*, include next-env + **/*.ts/tsx + .next/types, exclude node_modules/skills/sample-build/docs
```

### 3.3 Critical Code Patterns

#### Pattern 1: Atomic Lease (one generation per session, crash-safe)

```typescript
// src/app/api/chat/route.ts — POST
/**
 * Atomically claim a 195 s busy window; require 3 s since last claim.
 * Crash-safe: lease expires after 195 s so a crashed handler cannot
 * permanently block the workspace. Only the holder (owner+lease value)
 * can release via conditional UPDATE.
 */
const now = new Date();
const proposedLease = new Date(now.getTime() + 195_000);
const [claimed] = await db.update(sessions)
  .set({ busyUntil: proposedLease, lastRequest: now })
  .where(and(
    eq(sessions.id, owner),
    lt(sessions.busyUntil, now),
    lt(sessions.lastRequest, new Date(now.getTime() - 3000)),
  ))
  .returning({ id: sessions.id });
if (!claimed) throw new ApiError(429,
  "A response is already running, or messages were sent too quickly. Wait a moment and try again.");
lease = proposedLease;
// release: conditional on the exact lease value (prevents stealing)
await db.update(sessions)
  .set({ busyUntil: new Date(0) })
  .where(and(eq(sessions.id, owner), eq(sessions.busyUntil, lease)));
```

**Why this pattern:** Direct DB-level mutual exclusion without Redis/advisory locks; `RETURNING` proves claim success. `delete` path uses `transaction + FOR UPDATE` on `sessions` where `busyUntil < now`, else 409 — cannot race a running generation. Delete refuses (concurrency-safe) and lease expiry prevents deadlock after crash.

#### Pattern 2: Incremental SSE Parser (shared server + client)

```typescript
// src/lib/sse.ts — SSEParser (MAX 1_000_000 chars)
// Handles LF, CRLF, or lone CR (SSE spec); CRLF split across push() calls
// via skipLF; strips exactly one space after "data:"; joins multiline
// data with \n; checks sizes incrementally so limits don't depend on chunk size.

private skipLF = false;
push(chunk: string): string[] {
  const events: string[] = [];
  let start = 0;
  for (let idx = 0; idx < chunk.length; idx++) {
    const ch = chunk[idx];
    if (this.skipLF) { // previous char was \r, current may be \n of a split CRLF
      this.skipLF = false;
      if (ch === "\n") { start = idx + 1; continue; }
    }
    if (ch !== "\r" && ch !== "\n") continue;
    this.append(chunk.slice(start, idx));   // incremental lineLength check
    this.consumeLine(events);               // data: exactly-one-space, \n-join
    this.skipLF = ch === "\r";
    start = idx + 1;
  }
  this.append(chunk.slice(start));
  return events;
}
finish(): string[] { return this.push("\n\n"); }
```

**Why this pattern:** Changes affect both sides — `route.ts` consumes provider chunks via `parser.push(decoder.decode(value,{stream:true}))` and `chat-workspace.tsx` consumes browser chunks the same way. Incremental accounting means a 600 KB + 500 KB two-line event is rejected on the second line, not only after concatenation.

#### Pattern 3: Pure Same-Origin Gate

```typescript
// src/lib/origin.ts — free of Next/DB imports → node:test can import it
export function isSameOriginRequest(
  origin: string | null, host: string | null,
  forwardedHost: string | null, secFetchSite: string | null,
): boolean {
  if (secFetchSite === "cross-site") return false;
  if (!origin || !host || !URL.canParse(origin)) return false;
  const url = new URL(origin);
  if (!["http:", "https:"].includes(url.protocol)) return false;
  const forwarded = forwardedHost?.split(",")[0]?.trim(); // first of chain
  return url.host === host || (Boolean(forwarded) && url.host === forwarded);
}
// src/lib/server.ts
export function assertOrigin(req: NextRequest) {
  if (!isSameOriginRequest(
    headers.get("origin"), headers.get("host"),
    headers.get("x-forwarded-host"), headers.get("sec-fetch-site"),
  )) throw new ApiError(403, "This action must be made from your chat workspace.");
}
```

**Why this pattern:** Cloudflare rewrites `Host` to upstream; public host arrives as `x-forwarded-host`. Browsers cannot forge `Origin`/`sec-fetch-site`; direct attackers can spoof `Host` anyway — so matching `Host` was never the CSRF boundary. Cross-site still fails both checks. Unit suite proves 7 cases including chained `x-forwarded-host, edge.example.net` (uses first).

#### Pattern 4: Owner-Scoped Persistence + Reasoning Stripping

```typescript
// src/app/api/conversations/route.ts — list + search
const searchPattern = (term: string) =>
  `%${term.replace(/[\\%_]/g, "\\$&")}%`; // escape LIKE wildcards
const condition = term
  ? and(eq(conversations.owner, owner), or(
      ilike(conversations.title, searchPattern(term)),
      sql`exists (select 1 from jsonb_array_elements(${conversations.messages}) as m
                   where m->>'content' ilike ${searchPattern(term)})`
    ))
  : eq(conversations.owner, owner);
// GET [id] — never leak reasoning_content to browser
{ messages: item.messages.map(({ reasoning: _r, ...m }) => m) }
// chat route — persist only completed answer
if (truncated) assistant.content += "\n\n*Response reached the output limit. Ask me to continue.*";
await db.update(conversations)
  .set({ messages: [...saved.messages, assistant], updatedAt: new Date() })
  .where(eq(conversations.id, saved.id));
send({ type: "done", message: { id: assistant.id, role: assistant.role, content: assistant.content } });
// reasoning kept in DB for multi-turn: messages.map(m => ...reasoning_content: m.reasoning)
```

**Why this pattern:** Every read/mutation filters by `owner` (SHA-256 of cookie); `reasoning_content` is persisted for multi-turn context but mapped out on every browser response (`GET [id]` + `done` event sends `content` only). Duplicate-retry guard: if last DB message is `user` with same `content` + `image`, reuse `messages` array (prevents duplicate user turn on transparent retry). 100-conversation cap checks `count(*)::int` before insert.

#### Pattern 5: Bounded Body + Curated Errors + Structured Logs

```typescript
// src/lib/server.ts — readJson: 3 MB bound, typed errors, never raw parse leak
export async function readJson(req: NextRequest, maxBytes = 3_000_000): Promise<unknown> {
  if (!req.headers.get("content-type")?.includes("application/json"))
    throw new ApiError(415, "Send a JSON request.");
  // stream via reader.read(), size+=value.byteLength, cancel() at >maxBytes → 413
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new ApiError(400, "The request contains invalid JSON."); }
}
export function errorResponse(error: unknown, operation: string) {
  if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status });
  const requestId = crypto.randomUUID();
  console.error(JSON.stringify({ operation, requestId, errorType: error instanceof Error ? error.name : "UnknownError" }));
  return NextResponse.json({ error: "The workspace could not complete this action. Please try again.", requestId }, { status: 500 });
}
// route.ts uses ApiError for 400/401/403/409/413/415/429/502/503 with actionable copy:
// 503 "Connect NVIDIA to start chatting. Add NVIDIA_API_KEY… Your message is still here."
// 429 "A response is already running…"
// 403 "This action must be made from your chat workspace."
// 502 "NVIDIA rejected the server API key…" / "NVIDIA is busy…"
// 413 "The attachment is too large. Use an image under 2 MB."
```

**Why this pattern:** Single error funnel (`ApiError` + `errorResponse`) guarantees user-facing copy is curated and actionable, never generic, never leaking provider internals; 500 path logs only `operation/requestId/errorType` (no message/cookie/key) and returns `requestId` for support correlation. Client mirrors with `apiJson`/`parseOrReload` so degraded HTML never shows raw parse errors.

---

## 4. Data Architecture

### 4.1 Database Schema

```mermaid
erDiagram
  chat_sessions ||--o{ conversations : "owner → id (FK cascade)"
  chat_sessions {
    text id PK "SHA-256(kimi_session) — 64-hex token digest"
    timestamptz created_at "default now()"
    timestamptz last_request "default 1970-01-01, updated on lease claim"
    timestamptz busy_until "default 1970-01-01, lease expiry 195 s"
  }
  conversations {
    uuid id PK "default gen_random_uuid()"
    text owner FK "→ chat_sessions.id, onDelete cascade"
    text title "1-100 chars, sliced from first prompt (70) or renamed"
    jsonb messages "ChatMessage[] default '[]' — user/assistant, image?, reasoning?"
    timestamptz created_at "default now()"
    timestamptz updated_at "default now(), index (owner, updatedAt)"
  }
```

**SQL source of truth:** `drizzle/0000_flimsy_sage.sql` (journal `drizzle/meta/_journal.json` + snapshot `0000_snapshot.json`). Single migration to date; `drizzle.config.ts` is `defineConfig({ dialect:"postgresql", schema:"./src/db/schema.ts", out:"./drizzle", dbCredentials:{url: DATABASE_URL}, verbose:true, strict:true })`. `drizzle-kit generate` → `drizzle/*.sql`; `drizzle-kit migrate` applies journal in order; `npx drizzle-kit push` is prototyping only (not production-safe).

### 4.2 Data Models

```typescript
// src/lib/types.ts — shared by Drizzle $type<ChatMessage[]> + UI
interface ChatMessage {
  id: string;                          // crypto.randomUUID() per turn
  role: "user" | "assistant";
  content: string;                     // 1–16000 chars (zod), trimmed
  image?: string;                      // data:image/(png|jpeg|webp);base64,… ≤2.8M chars, magic-byte verified, ≤2 MB bytes
  reasoning?: string;                  // assistant only — reasoning_content from provider, persisted for multi-turn, stripped from browser
}
interface ConversationSummary { id: string; title: string; updatedAt: string; }
interface ChatSettings {
  temperature: number;   // 0–2, default 1
  maxTokens: number;     // 256–16384, default 16384
  reasoningEffort: "low" | "high" | "max"; // default max
}
```

**Limits (server is authority, client mirrors for UX):**

| Guard | Value | Enforcer |
|-------|-------|----------|
| Request body | 3 MB | `readJson(req, 3_000_000)` → 413 |
| Prompt chars | 1–16 000 | `zod` + `chatInputSchema` → 400 |
| Image (chars) | ≤2 800 000 | `imageSchema` regex → 400 |
| Image (bytes) | ≤2 MB + magic-byte PNG/JPEG/WEBP | `route.ts` `Buffer` check → 400 |
| History per conversation | 60 messages OR 16 000 000 JSON chars | `route.ts` → 400 “Start a new chat” |
| Conversations per workspace | 100 (`count(*)::int`) | `route.ts` → 400 “Delete an older chat” |
| Response chars | 1 200 000 (`content + reasoning`) | `route.ts` inside `consume()` → “Response size limit exceeded” → error event, not persisted |
| Provider `max_tokens` | 256–256 000 | `validation` strict enum/number |
| Title rename | 1–100 | `titleSchema` → 400 |
| Conversation search term | 200 chars, wildcards escaped | `searchPattern` |

### 4.3 Persistence Strategy

- **Pool:** `src/db/index.ts` `new Pool({ connectionString: DATABASE_URL })`, cached on `globalThis.__arenaNextJsPostgresqlPool` in dev (prevents HMR leak), `globalForDb` singleton. Throws at import if `DATABASE_URL` missing — every API route imports `db`, so app refuses to start without DB (verified via `npm run build` + `curl /api/health` 500 when DB unreachable).
- **Queries:** Drizzle parameterized only; never string-concatenate SQL. `ilike` + `sql` template for `jsonb_array_elements` search; `exists` subquery; `FOR UPDATE` for delete lease check; `RETURNING` for lease claim.
- **Migrations:** `npm run db:generate` (edit `schema.ts` → generate SQL + snapshot + journal) → commit `drizzle/*.sql` → `npm run db:migrate` (production-safe). `drizzle-kit push --url="$DATABASE_URL"` for one-off pushes against non-default DB (tooling, not CI).
- **Seeding:** `src/db/seed.ts` + `scripts/seed.mjs` — idempotent, injected `{db, tables}` (no `@/` aliases, explicit `.ts` extensions for `node --experimental-strip-types`), `onConflictDoNothing` pattern, logs `{operation:"db.seed", inserted}`. Verified: first run `{inserted:1}`, second `{inserted:0}`.
- **Retention:** `src/lib/retention.ts` pure `pruneIdleSessions({idleDays})` (deletes `sessions` where `lastRequest < cutoff`, cascade deletes conversations) + `pruneStaleConversations({olderThanDays})` (deletes `conversations` where `updatedAt < cutoff` without touching sessions). CLI `scripts/prune-expired.mjs` → `npm run prune -- --idle-days 30 [--conversation-days 90]`, logs `{operation:"retention.prune", idleDays, conversationDays, sessionsDeleted, conversationsDeleted}`. No cron scheduled yet (operator backlog I6).

---

## 5. Design System Reference

### 5.1 Typographic System

`src/app/globals.css` imports Tailwind, then defines editorial mint-calm typography:

- **Font family:** `Arial, Helvetica, sans-serif` for UI (system sans); code `ui-monospace, SFMono-Regular, Menlo, monospace` for `markdown pre/code`.
- **Hierarchy:** Page `h1` `clamp(34px, 3.7vw, 52px)` light weight, italic serif span (`Georgia`) for “a conversation”; markdown `h1 23px`, `h2 19px`, `h3 16px` (letter-spacing `-0.3px`); `welcome-eyebrow` `8px uppercase letter-spacing 2px`; `history-heading` `9–10px`; `sidebar` `11–12px`; composer `12–13px`.
- **Weights:** 500–600 for headings/titles, 400 for body, 600–750 for brand `kimi.`.

### 5.2 Color Tokens (CSS-first @theme)

| Token | Hex | Usage | WCAG |
|-------|-----|-------|------|
| `--canvas` | `#fcfdfb` | App background | Canvas |
| `--sidebar` | `#f5f7f3` | Sidebar surface | Sidebar |
| `--surface` | `#fff` | Composer/dialog surface | Surface |
| `--ink` | `#26362f` | Primary text | Ink |
| `--muted` | `#5f6c55` | Secondary text | Muted — secondary on warm white/mint (contract covered in report L1) |
| `--subtle` | `#626e65` | Tertiary | Subtle |
| `--line` | `#e5e9e2` | Borders | Line |
| `--green` | `#306345` | Primary accent, links, brand | AAA on mint |
| `--green-dark` | `#244d36` | Hover | Dark |
| `--mint` | `#e8f0e2` | Accent wash (chips, highlights) | Mint |
| `--focus` | `#60926f` | Focus ring `outline 2px solid var(--focus)` + composer `2px solid #b4c5a6` | Focus |
| `--danger` | `#a44539` | Errors, destructive | Danger |
| `--radius` | `14px` | Corner rounding | Radius |

Additional accents: `.peach #faede4/#bd8d71`, `.lavender #f0edf9/#9b8cb2`, `.yellow #f7f1dd/#baa05d`, `.mint bg #eaf2e5/#82996a` for category icons.

### 5.3 Component Primitives

- **Library discipline (CRITICAL per `CLAUDE.md`):** Only Radix Dialog is used from outside; all other chrome is bespoke `globals.css` — composer `.composer:focus-within border #aabf94`, `box-shadow 0 0 0 3px #d6e4c829`, buttons with `transition background/color/box-shadow/transform 0.18s`, `button:active translateY(1px)`.
- **Radix usage:** `Dialog.Root` + `Dialog.Overlay asChild` (`.mobile-scrim`) + `Dialog.Content asChild` + `onCloseAutoFocus` → focus opener; `Dialog.Title`/`Description` for a11y; `Dialog.Close` for `Modal`. Radix backdrop is `aria-hidden`; drawer carries `.sidebar-close` inside.
- **Markdown:** `react-markdown` + `remark-gfm` with `a → target _blank noopener noreferrer`, `img → [Image: alt]` (no remote fetch), links underlined `offset 3px`, `pre` with `background #f1f4ed, border #e0e7d8, radius 9px`, `code` pill `background #f0f3eb`, tables `border-collapse` with `th bg var(--mint)`.
- **Icons:** `lucide-react` — `KimiMark` bespoke “K + square” SVG (23/30 px, `currentColor`), plus `Search`, `Plus`, `MessageSquare`, `Sparkles`, `Brain`, `Code2`, `ImageIcon`, `PenLine`, `Lightbulb`, `ChevronDown`, `X`, `Copy`/`Check`, `ArrowUp`/`ArrowUpRight`/`ArrowRight`, `ShieldCheck`, `SlidersHorizontal`, `Trash2`, `Download`, `Square`, `Menu`, `PanelLeftClose`, `MoreHorizontal`, `Command`, `Zap`, `Eye`, `Loader2` (spin), `ExternalLink`.

### 5.4 Motion / Animation

- **Keyframes:** `pulse` (thinking dots `opacity 0.4→1`, `translateY -3px`, 1.4 s, stagger 0.2 s), `spin` (`rotate 360`, 1.5 s linear, for `Loader2`), `fade-in` (`opacity 0→1`, 0.15–0.2 s for dialogs/toast), `welcome-in` (`opacity 0→1` + `translateY 7px→0`, 0.6 s ease-out for welcome).
- **Transitions:** `button` `background/color/box-shadow/transform 0.18s`; `composer` `border/box-shadow 0.2s`; `starter-card:hover translateY(-3px)` + `box-shadow 0 5px 18px #24391d08`.
- **Reduced motion:** `playwright.config.ts` `reducedMotion: "reduce"` for E2E; a global `prefers-reduced-motion: reduce` media query neutralizes animations (globals.css).

### 5.5 Responsive

`globals.css` media queries: `min-width 1500px` (sidebar 282 px, welcome 1020 px), `max-width 1150px` (sidebar 237 px, topbar tighter, `welcome h1 44px`, `image-capable` hidden), `max-width 900px` (starter-grid `repeat(2,1fr)`, `welcome h1 37px`, prompt starters last hidden). Mobile drawer `z-index 30` vs `mobile-scrim z-29`, `Dialog` portal via Radix.

---

## 6. Security Architecture

### 6.1 Security Rules

| # | Rule | Enforcement | Evidence |
|---|------|-------------|----------|
| S1 | Never log message content, cookies, or `NVIDIA_API_KEY` | `errorResponse` logs `{operation, requestId, errorType}` only; provider reasoning persisted but stripped from browser | `rg console.log` empty in `src/`, `rg reasoning_content` only in `route.ts` + `seed` |
| S2 | Every conversation query filtered by `owner` | `eq(conversations.owner, owner)` or `identity()` condition on all `select/update/delete` + `?q=` search | `rg eq(conversations.owner` — every table path has it |
| S3 | Writes require same-origin `Origin` | `assertOrigin` via `isSameOriginRequest` on `POST /api/chat` + `PATCH`+`DELETE /api/conversations/[id]` | 7 unit + 1 API regression test |
| S4 | `sec-fetch-site: cross-site` rejected | `isSameOriginRequest` first line + `ensureSession` also checks | Unit `rejects cross-site` + API `Origin: null → 403` |
| S5 | Session is 64-hex token, only SHA-256 stored | `randomBytes(32).toString("hex")`, `^[a-f0-9]{64}$` validate, `createHash("sha256")` | `sessionId()` + `ensureSession()` |
| S6 | Cookie is HttpOnly Strict, Secure over HTTPS | `response.cookies.set(kimi_session, token, {httpOnly:true, sameSite:"strict", secure: https|x-forwarded-proto, maxAge: 30d})` | `curl -sI /api/conversations` → `kimi_session=… HttpOnly; SameSite=strict`; Secure when `x-forwarded-proto: https` |
| S7 | Parameterized queries only | Drizzle `eq`, `ilike`, `sql` template with escaped `searchPattern` | `rg "drizzle"` — no raw SQL string concat |
| S8 | Body bounded, content-type validated | `readJson(req, 3_000_000)` checks `includes("application/json")`, `reader.read()` with `cancel()` on exceed → 413; JSON parse → 400; also 415 when missing | Unit + API `413` test |
| S9 | Image magic-byte verified | PNG `89 50 4E 47 0D 0A 1A 0A` (8), JPEG `FF D8 FF`, WEBP `RIFF....WEBP` + `bytes.length ≤ 2 MB` | `route.ts` magic-byte branch |
| S10 | No `NEXT_PUBLIC_` for `NVIDIA_API_KEY` | Key read only as `process.env.NVIDIA_API_KEY` on server; missing → 503 curated copy | `rg NEXT_PUBLIC` empty in `src/` |
| S11 | No `eval`/`dangerouslySetInnerHTML`/`innerHTML`/`document.write` | Scan fails build if present | `rg eval\|dangerously` empty (verified in report) |
| S12 | Curated error copy, requestId for 500 | `ApiError(status, message)` with actionable copy; `errorResponse` returns `{error, requestId}` on 500 | Every `throw new ApiError` has user-facing sentence |

### 6.2 Security Utilities Inventory

| File | Export | Role |
|------|--------|------|
| `src/lib/origin.ts` | `isSameOriginRequest` | Pure same-origin gate (unit-testable) |
| `src/lib/server.ts` | `ApiError`, `sessionId`, `ensureSession`, `setSession`, `assertOrigin`, `readJson`, `errorResponse`, `requireSession` | Cookie session (64-hex→SHA-256), origin assertion, bounded body, funnel errors |
| `src/lib/validation.ts` | `imageSchema`, `chatInputSchema`, `titleSchema`, `idSchema`, `providerChunkSchema` | zod at every boundary |
| `src/lib/sse.ts` | `SSEParser` | Bounded streaming parser (prevents oversized event DoS) |
| `src/db/schema.ts` | `sessions`, `conversations` | FK cascade, index, JSONB |

### 6.3 Authentication & Authorization

- **Model:** Browser-session workspace, not enterprise identity. No JWT, no OAuth, no durable user row. `kimi_session` 256-bit token → SHA-256 `owner` → `sessions.id` → `conversations.owner`. Clearing cookie loses workspace (documented, not “data loss”). `Secure` when `req.nextUrl.protocol === "https:"` or `x-forwarded-proto === "https"` (TLS ingress convention).
- **Ownership:** `identity(context)` validates `idSchema` (uuid), then `owner = await requireSession()` (401 if missing/invalid, 401 if session row missing), then `condition = and(eq(id, idParam), eq(owner, ownerHash))`. `GET/PATCH/DELETE` all use `condition`; `GET` returns 404 on mismatch (no 403 enumeration — indistinguishable from not found).
- **Session lifecycle:** `ensureSession` on `GET /api/conversations` (list) — generates token if missing/invalid, inserts `sessions` with `onConflictDoNothing`, returns `{owner, token}` and `setSession` sets cookie `no-store`. Other handlers use `requireSession` (401, no generation).
- **Lease (authorization to generate):** `POST /api/chat` claims lease; `DELETE /api/conversations/[id]` checks `sessions.busyUntil < now()` with `FOR UPDATE` — if session busy, 409 “Wait for the current response to finish before deleting a conversation.”
- **Future hardening (from README “Before public deployment”):** Add organizational auth/SSO with durable user ownership + recovery + RBAC; ingress IP/account rate limiting + global provider-spend quotas; retention cron; backups/least-privilege DB credentials/TLS/encryption at rest/monitoring/IR/secret rotation; idempotency tokens; CSP nonce-based `script-src`; broader a11y certification.

### 6.4 Threat Model

| Vector | Mitigation | Verified |
|--------|------------|----------|
| **CSRF (cross-site write)** | `Origin` + `sec-fetch-site: cross-site` gate on all writes; `x-forwarded-host` only from trusted ingress; browser cannot forge `Origin` | Unit 7 + API `cross-site → 403`, `Origin: null → 403` |
| **Session fixation/hijack** | Server-generated `randomBytes(32)`, 64-hex validate, 401 on bad, HttpOnly Strict, SHA-256 storage, fixation impossible | Code + `curl` HttpOnly Strict |
| **IDOR (owner bypass)** | Every table access via `eq(owner, hash)`; delete uses `FOR UPDATE` + `busyUntil` | E2E two contexts: second → 404 on first’s `GET/PATCH/DELETE` |
| **Injection (SQL)** | Drizzle parameterized + `searchPattern` escapes `\ % _` → `ilike` + `sql exists (jsonb_array_elements… ilike)` with bound param | `rg` no raw SQL |
| **Injection (XSS via model Markdown)** | `react-markdown` sanitizes raw HTML; `a` forced `target _blank noopener noreferrer`; `img` replaced with `[Image: alt]` | Component code |
| **DoS (oversized body/image/event)** | `readJson` 3 MB → 413, image 2.8M chars + 2 MB bytes + magic-byte, SSE `MAX 1_000_000` incremental, response 1.2M chars, 60 msgs/16 MB history, 100 convos | `route.ts` + `SSEParser` |
| **Credential leak** | No `NEXT_PUBLIC_` key, no log of content/cookie/key, `errorResponse` generic on 500 with `requestId`, `.env` gitignored + untracked (after late remediation), CI secret scan | `rg NEXT_PUBLIC` empty, `git grep` pattern on app code 0 hits |
| **Clickjacking** | `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` | `next.config.ts` + `curl -sI` |
| **MIME sniff** | `X-Content-Type-Options: nosniff` | `next.config.ts` |

---

## 7. Testing Strategy

### 7.1 Test Distribution

| Category | Files | Tests | Framework | Location |
|----------|-------|-------|-----------|----------|
| **Unit** | 2 | 22 | `node:test` + `--experimental-strip-types` | `tests/core.test.mjs` (15), `tests/origin.test.mjs` (7) |
| **E2E — Workspace (DB-backed)** | 1 | 12 | Playwright `request` + Drizzle fixtures | `tests/workspace.spec.ts` |
| **E2E — Stream UI (hermetic)** | 1 | 4 | Playwright (mocks both APIs) | `tests/stream-ui.spec.ts` |
| **E2E — Live Site (gated)** | 1 | 12 | Playwright + `LIVE_SITE_URL` + `axe` | `tests/live-site.spec.ts` (skipped unless `LIVE_SITE_URL` set) |
| **Total local** | 4 | **16 passed** (12 workspace + 4 stream-ui) + 12 skipped live | — | `28 tests using 1 worker` |

### 7.2 Test Patterns

- **Unit (node:test, strip-types):** Direct import of `../src/lib/sse.ts`, `../src/lib/validation.ts`, `../src/lib/origin.ts` with explicit `.ts` extension. Patterns:
  - `chatInputSchema` trims, rejects empty/oversized/unknown/malformed/image URL, rejects `maxTokens 20000`.
  - `titleSchema` boundaries `1–100` (`100` ok, `` empty 400, `101` 400).
  - `SSEParser` fragmented CRLF + multiline, lone-CR, CRLF split across chunks, comment `: keepalive`, exactly-one-space `data:` (`no-space` → `no-space`, `  two-spaces` → ` two-spaces`), incremental size rejects (1_000_001-char line, 600k+500k accumulated event).
  - `isSameOriginRequest` 7 cases (direct, proxied, chained, http vs ftp/javascript, cross-site, missing/malformed/null, mismatch).

- **E2E — DB-backed (requires `npm run build && npm start` + disposable `DATABASE_URL`, no `NVIDIA_API_KEY` by design):** Uses `TEST_BASE_URL ?? http://localhost:3000`, `baseURL` + `reuseExistingServer: true`, `db`/`pool` + `createHash("sha256")` owner helpers, `eq` cleanup. Key suites (from `workspace.spec.ts`):
  - `welcome, prompt starters, settings and accessible dialogs` — category card → fill prompt → settings dialog → `Deep think aria-pressed false` → new chat clears.
  - `reports missing provider key without discarding the draft` — fill → send → `role="alert" Connect NVIDIA Add NVIDIA_API_KEY` → draft preserved, welcome still visible (503 path, no `NVIDIA_API_KEY` env).
  - `image attachment can be added and removed` — `setInputFiles` one-pixel PNG base64 → preview visible → draft `What can you tell me…` → remove.
  - `mobile navigation and composer fit the viewport` — 390×844, Open navigation → Search visible → Close navigation + no scrollWidth overflow + screenshot.
  - `mobile navigation closes on Escape and restores focus` — Open → Escape → `.sidebar` not visible + `[aria-label="Open navigation"]` focused (Radix).
  - `workspace and settings satisfy automated WCAG AA checks` — `AxeBuilder` `wcag2a,2aa,21aa,22aa` on page + dialog → 0 violations.
  - `conversation CRUD enforces session isolation and same-origin writes` — two `browser.newContext()` → owner hashes → insert → second → 404 read/patch/delete → cross-site patch 403 → empty title 400 → rename 200 + `cache-control: no-store` → read back → delete 200 → 404.
  - `API rejects malformed input and cross-site requests` — empty `content` → 400, `Origin: untrusted` → 403, `Origin: null` → 403, `not-a-uuid` → 400, `health` 200.
  - `same-origin writes pass through trusted proxies via x-forwarded-host` — Origin `proxy-check.example` vs `x-forwarded-host: proxy-check.example` with rewritten Host → 400 not 403 (gate passed, validation failed); mismatched `evil.example` + `host` → 403 (two cases).
  - `conversation search matches titles and message content, isolated by owner` — insert `Quarterly planning notes` + `xylophone rehearsal` → `?q=quarterly` 1, `?q=xylophone` 1 (content-only), `zzz…` 0, second session `xylophone` 0.
  - `search dialog finds conversations by message content` — insert then `ControlOrMeta+k` → fill `xylophone` → `Quarterly…` visible → `zzz…` → `No conversations found`.
  - `retention prunes idle sessions with their conversations and stale conversations` — idle 60 days + active + stale 90 days → `pruneIdleSessions(30)` removes idle + cascade, keeps active/stale → `pruneStaleConversations(30)` removes stale, keeps stale session + active.

- **Stream UI (hermetic, no DB):** Mocks both API endpoints, renders GFM table, verifies WCAG on error state, non-JSON friendly copy.

- **Live Site (env-gated):** Validates deployed `https://kimi-chat.jesspete.shop` when `LIVE_SITE_URL` set — health, headers/cookie (nosniff, DENY, HSTS, CSP, HttpOnly Strict Secure), API contract, session isolation, and provider streaming (waits for nonce inside `.message.assistant` only, asserts `Copy response`, checks persistence via `GET /api/conversations`; treats error banner as failure with banner text).

### 7.3 Coverage Thresholds

No enforced `%` threshold in CI (tracked as TODO). The audit ledger requires *behavioral* coverage: every doc claim + every failure surface is exercised (missing key 503, lease 429, origin 403, validation 400, provider 502, oversized 413, stream error, degraded HTML). Incrementally bounded SSE and owner-scoped search are unit-tested; WCAG is axe-scanned on welcome/dialog/error.

### 7.4 Pre-PR / Pre-Deploy Checklist

Run **in order** (per `AGENTS.md` Verification order; typecheck runs `next typegen` before `tsc` so route types can never be stale):

```bash
npm run typecheck   # next typegen && tsc --noEmit (strict, zero any/@ts-ignore)
npm run lint        # eslint flat + next/core-web-vitals (skills/sample-build/docs excluded)
npm test            # node --experimental-strip-types --test tests/*.test.mjs → 15/15
npm run build       # next build Turbopack → 6 routes, ~0.6–3s
# E2E (needs prod preview + disposable DB + no NVIDIA_API_KEY):
npm run db:migrate
npm run build && npm start &   # or bg_start PORT=3004 npm start -- --port 3004
TEST_BASE_URL=http://localhost:3004 npx playwright test  # 12 skipped, 16 passed (14.5s) locally
```

Also: `npm audit --omit=dev` (CI `production audit clean`) and secret scan `git grep -lIE 'nvapi-…|PRIVATE KEY|ghp_|AKIA' -- src tests scripts drizzle` → 0 hits (app code). Full scan `git grep … -- . ':!package-lock.json' ':!skills/**' ':!sample-build/**' ':!docs/**'` → 0 hits (reference material excluded per `tsconfig`).

---

## 8. Build & Deployment

### 8.1 Production Build

```bash
npm ci              # Node ≥22, uses package-lock.json
npm run db:migrate  # drizzle-kit migrate (journal-driven)
npm run build       # next build (Turbopack) → .next/
npm start           # next start (NODE_ENV=production, reads .env, needs DATABASE_URL)
```

**Output:** `.next/` + `next typegen` route types in `.next/types`. `Route (app)` table: `○ /` SSR static, `○ /_not-found` static, `ƒ /api/chat` (nodejs, maxDuration 180), `ƒ /api/conversations`, `ƒ /api/conversations/[id]`, `ƒ /api/health` dynamic. TypeScript `Finished in 2.8s`, page generation `(4/4) in ~320ms`. Verified: `npm run build` → `Compiled successfully in 662ms–3s`.

### 8.2 Environment Variables

| Name | Required | Description | Default |
|------|----------|-------------|---------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string `postgresql://user:pass@host:port/db` | — (app throws `DATABASE_URL is required` at `src/db/index.ts` import if missing — nothing runs) |
| `NVIDIA_API_KEY` | For chat | Server-only key from `build.nvidia.com` for `moonshotai/kimi-k3` (never `NEXT_PUBLIC_`) | — (missing → `POST /api/chat` 503 “Connect NVIDIA to start chatting. Add NVIDIA_API_KEY… Your message is still here.” — by design, E2E uses this) |
| `TEST_BASE_URL` | No | Playwright target origin | `http://localhost:3000` (or `http://localhost:3004` when 3000 busy) |
| `LIVE_SITE_URL` | No | Target for `tests/live-site.spec.ts` (`https://kimi-chat.jesspete.shop`) | — (suite skipped when unset) |

`.env` is untracked, gitignored (`.gitignore:10:.env`, `!.env.example` kept), after late remediation `272d7ff` (prior claim `dc1c664` did not take effect; at `eb654aa` `git ls-tree -r HEAD -- .env` still showed it). History retains exposed keys — rotate at GitHub + NVIDIA console.

### 8.3 Docker Configuration

**File:** `docker-compose.yml` (local dev only; no prod Dockerfile).

```yaml
services:
  postgres:
    image: postgres:17-alpine
    container_name: new_chat_postgres
    restart: unless-stopped
    environment: { POSTGRES_DB: chat_db, POSTGRES_USER: chat_user, POSTGRES_PASSWORD: chat_secret, PGDATA: /var/lib/postgresql/data/pgdata }
    ports: ["5433:5432"]   # 5433 on host avoids clash with Scandi Haven 5432
    volumes: [chat_data:/var/lib/postgresql/data, ./infrastructure/postgres/init:/docker-entrypoint-initdb.d]
    healthcheck: { test: pg_isready -U chat_user -d chat_db, interval 5s, timeout 5s, retries 10, start_period 10s }
    networks: [chat_net]
volumes: { chat_data: local }
networks: { chat_net: bridge }
```

**Init:** `infrastructure/postgres/init/00-create-extensions.sql` — `CREATE EXTENSION IF NOT EXISTS pgcrypto` (for `gen_random_uuid()`) + `pg_trgm` (future fuzzy search) + `RAISE NOTICE` verify; runs once on first volume creation.

**Ops:**

```bash
docker compose up -d                # start, healthcheck 5 min healthy
docker compose logs -f postgres     # ready to accept connections
docker compose down                  # stop
docker compose down -v               # RESET — deletes chat_data (warning)
npm run db:migrate && npm run db:seed # after up -d
```

Verified rebuild: `sudo docker ps` → `new_chat_postgres Up 5 minutes (healthy) 0.0.0.0:5433->5432`, `npm run db:migrate` → `[✓] migrations applied`, `npm run db:seed` → `{inserted:1}` → `{inserted:0}`.

### 8.4 CI/CD Pipeline

**File:** `.github/workflows/ci.yml` · **Trigger:** `push: branches: [main]` + `pull_request` (fixed from `branches: ain]` at `dc1c664`).

```yaml
jobs:
  gates:
    runs-on: ubuntu-latest
    steps: checkout@v4 → setup-node@v4 (node 22, cache npm) → npm ci
            → Secret scan: git grep -lIE 'nvapi-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}' -- . ':!package-lock.json' → fail if hit
            → npm run typecheck → npm run lint → npm test → npm run build → npm audit --omit=dev
  e2e:
    runs-on: ubuntu-latest
    services: { postgres: { image: postgres:17, env: { POSTGRES_USER: postgres, POSTGRES_PASSWORD: postgres, POSTGRES_DB: app_db }, ports: [5432:5432], healthcheck: pg_isready } }
    env: { DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:5432/app_db }
    steps: checkout → setup-node → npm ci → npm run db:migrate → npm run build → npx playwright install chromium --with-deps
            → npx playwright test (TEST_BASE_URL unset → uses webServer: npm start, reuseExistingServer true)
            → upload-artifact test-results/ on failure (7 days)
```

**Quality gates order (never weaken):** `typecheck → lint → test → build`. No `@ts-ignore`, no disabled rules, no deleted tests — fix root causes. `next typegen` runs before `tsc` so route-param generation can never be skipped.

---

## 9. Developer Handbook

### 9.1 Local Setup

**Requirements:** Node.js ≥22 (unit tests rely on `--experimental-strip-types`), Docker (for Postgres), PostgreSQL client optional.

**Minimal (no DB, UI renders but sessions fail):**

```bash
npm ci
npm run build   # typecheck + build
npm start       # will 500 on /api/health until DATABASE_URL set
```

**Full (recommended):**

```bash
git clone https://github.com/nordeim/new-chat-app.git
cd new-chat-app
npm ci                              # use ci, not install
cp .env.example .env                # edit: DATABASE_URL=postgresql://chat_user:chat_secret@127.0.0.1:5433/chat_db
sudo docker compose up -d           # postgres 17 on 5433 (healthy in ~10s)
npm run db:migrate                  # apply drizzle/0000_flimsy_sage.sql
npm run db:seed                     # optional, idempotent demo row
npm run dev                         # http://localhost:3000 — mint workspace with prompt starters
curl http://localhost:3000/api/health  # {"ok":true}
```

**If port 3000 busy** (Scandi Haven sibling holds 3000): use `PORT=3004 npm start -- --port 3004` + `TEST_BASE_URL=http://localhost:3004 npx playwright test`.

### 9.2 Common Commands

| Task | Command | Notes |
|------|---------|-------|
| Install (ci) | `npm ci` | Use `ci`, not `install` |
| Dev server | `npm run dev` | `next dev` (HMR, `globalThis` Pool cache) |
| Production build | `npm run build` | `next build` Turbopack, 6 routes |
| Serve prod | `npm start` | `next start`, needs `DATABASE_URL` |
| Lint | `npm run lint` | `eslint .` flat, skips skills/sample-build/docs |
| Typecheck | `npm run typecheck` | `next typegen && tsc --noEmit` — never skip `typegen` |
| Unit tests | `npm test` | `node --experimental-strip-types --test tests/*.test.mjs` → 15/15 |
| Single unit file | `node --experimental-strip-types --test tests/core.test.mjs` | — |
| E2E (prod preview) | `npm run test:e2e` | Needs `npm run build && npm start` + disposable `DATABASE_URL` + no `NVIDIA_API_KEY` |
| Single E2E suite | `npx playwright test tests/workspace.spec.ts -g "x-forwarded-host"` | Filter by title |
| E2E on alt port | `TEST_BASE_URL=http://localhost:3004 npx playwright test` | When 3000 busy |
| Live E2E | `LIVE_SITE_URL=https://host npx playwright test tests/live-site.spec.ts` | Skipped unless `LIVE_SITE_URL` set |
| Prune idle | `npm run prune -- --idle-days 30 [--conversation-days 90]` | Logs JSON summary |
| Generate migration | `npm run db:generate` | Edit `schema.ts` first → commit `drizzle/*.sql` |
| Apply migrations | `npm run db:migrate` | `drizzle-kit migrate` (production-safe) |
| Seed fresh DB | `npm run db:seed` | Idempotent |
| Push schema (dev) | `npx drizzle-kit push` | Prototyping only |
| One-off push to other URL | `npx drizzle-kit push --url="$DATABASE_URL"` | Tooling |

**Verification order before commit:** `npm run typecheck` → `npm run lint` → `npm test` → `npm run build` → (if touching DB/UI) `npm run test:e2e` against prod preview.

### 9.3 Code Style Rules

- **TypeScript:** `strict`, no `any` (use `unknown` + narrowing), no `@ts-ignore`, no explicit return types unless inference fails; `interface` over `type` for shapes.
- **React 19:** Handle all UI states (loading/error/empty/success); disable controls during async; keep derived state out of `useState`; effects must not call `setState` synchronously (`react-hooks/set-state-in-effect` is error, fixed via `queueMicrotask`).
- **Zod at boundaries:** All external input validated in `src/lib/validation.ts` (`chatInputSchema` 16k, `titleSchema` 1–100, `imageSchema` data-uri, `providerChunkSchema`). Client validates API/stream payloads via `apiJson`/`parseOrReload` (degraded HTML never shows raw parse errors).
- **Imports:** `tsconfig` `baseUrl .` + `paths @/* → src/*`; scripts use explicit `.ts` extensions (Node type-stripping requires extensions, no `@/` alias in scripts — `retention.ts`/`seed.ts` keep runtime imports to `drizzle-orm` + injected tables).
- **Formatting:** After `eslint --fix`, re-run formatting/order-sensitive gates and restage so index matches working tree.
- **Library discipline:** Use Radix when it exists (`Dialog`); do not rebuild from scratch; bespoke styles only for the mint editorial vision.

### 9.4 Git Workflow

- **Branch:** All commits on `main` (no feature branches in this repo’s workflow).
- **Commits:** Atomic, descriptive `why` (not just `what`); run the full gate order before each commit. Examples: `fix(api): accept x-forwarded-host…`, `fix(streaming): adopt incremental SSE parser…`, `security: untrack .env…`, `docs(plan): …`.
- **Secrets:** Never commit `.env` / keys / private keys; `.env` is gitignored + untracked; if a secret lands in history, rotate it (history still holds it). CI secret scan fails on credential patterns.
- **Excludes:** `tsconfig.json` + `eslint.config.mjs` deliberately exclude `skills/`, `sample-build/`, `docs/` — they are reference material, not app code; do not remove excludes.

---

## 10. Known Issues & Outstanding Tasks

| Priority | Issue | Impact | Status |
|----------|-------|--------|--------|
| 🔴 **CRITICAL** | **SSH private key in git history** (`docs/ssh-key.txt` removed from tracking but still in history — see `CODE_REVIEW_REPORT.md` C1) | Repo read = push access until rotation | **OPEN — operator rotation pending** (credential reused for push automation) |
| 🔴 **CRITICAL** | **NVIDIA key in git history** (`.env` added `7afe083`, tracked until `272d7ff`; embedded key in `docs/prompt-to-create.md` redacted `dc1c664`; current key `nvapi-vn-hb…` tracked until late remediation; NVIDIA 403 “Authorization failed” proves dead but history retains it) | Exposure cannot be undone without `git filter-repo`; rotation is the correct closure | **OPEN — rotation advised (key reads as dead)**, untracked at `272d7ff`, addendum `6be7596` |
| 🟠 **HIGH** | **Prod must be redeployed** for `d039d1e` proxy-aware origin gate to take effect (every browser `POST /api/chat` 403 behind Cloudflare until deployed) | Chat broken in production until redeploy | **Code remediated, redeploy required** — then `LIVE_SITE_URL=https://kimi-chat.jesspete.shop npx playwright test tests/live-site.spec.ts` should go 12/12 with real streamed answer |
| 🟢 **LOW (debt)** | **CI secret scan over-scans reference material** — `git grep … -- . ':!package-lock.json'` hits `skills/`, `sample-build/`, `docs/` example keys (false positives) | Would fail CI if those files are tracked and contain `nvapi-` examples | Advisory: scope to `src tests scripts drizzle` or add `':!skills/**' ':!sample-build/**' ':!docs/**'` |
| ⚪ **Info** | **100-conversation cap race** — concurrent `count → insert` can transiently exceed by 1 (bounded, self-corrects via retention; advisory-lock fix adds complexity without real risk) | Self-inflicted, bounded | **Accepted** (report I1) |
| ⚪ **Info** | **429 lease-conflict has no automated test** (reaching lease requires valid provider key) | SQL condition `UPDATE … WHERE busyUntil < now` is concurrency-safe but untested via API | **Backlog** — extract lease seam for injectable coverage if wanted (I2) |
| ⚪ **Info** | **CSP is minimal** (`frame-ancestors 'none'; base-uri 'self'; object-src 'none'`) — nonce-based `script-src` remains deployment hardening | Framing/base/plugins covered; script nonce is deployment-specific | **Carried** (I3) |
| ⚪ **Info** | **`workspace-polish.css` not adopted** from `sample-build` | Override targets sample-build’s stylesheet, not this app’s tuned `globals.css` | **Deliberately not adopted** (I4) — Radix frame + incremental parser were adopted |
| ⚪ **Info** | **Lighthouse not re-run this PAD** | No render-path change beyond additive CSS/a11y; pass-2 baseline (90/100/96) stands | **Deferred** (I5) until next perf pass |
| ⚪ **Info** | **`npm prune` unscheduled** | Cookie expiry alone does not delete DB data | **Operator — schedule weekly cron** (` --idle-days 30 [--conversation-days 90]`) (I6) |
| ⚪ **Info** | **Two session artifacts now tracked** (`docs/session_1.md`, `docs/recent_code_changes_to_validate.txt` added at `9db90b2`) | Worklog + pull transcript preserved for audit trail | **Tracked as evidence** — delete if unwanted |
| ⚪ **Info** | **`db-init-and-e2e-plan.md` added** (post-rebuild evidence) | Plan + evidence for `5433` rebuild (`[✓] migrations`, `{inserted:1→0}`, 662 ms build, 3004 16 passed) | **Tracked** — keep as runbook or archive |

---

## 11. Key Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| `src/app/api/chat/route.ts` | ~350 | Core — origin→session→zod→magic-byte→lease→upsert→NVIDIA SSE→persist final only→SSE (meta/thinking/delta/done/error) |
| `src/app/api/conversations/route.ts` | ~70 | List/search `GET` — owner-filtered, `?q=` ILIKE title+JSONB content, escaped, `configured` flag, sets cookie |
| `src/app/api/conversations/[id]/route.ts` | ~130 | Read (strip `reasoning`)/rename (1–100)/delete (`FOR UPDATE` + 409 if busy) — all owner-scoped |
| `src/app/api/health/route.ts` | ~15 | `db.execute(select 1)` → `{ok:true}` / 500 — no provider check |
| `src/components/chat-workspace.tsx` | ~1500 | Entire client UI — zod `summary/message/streamEvent` schemas, `apiJson`/`parseOrReload`, debounced `?q=` 250 ms, lease retry, Radix via `NavigationFrame`, markdown sanitized, attachment 2 MB, `reasoning` stripped |
| `src/components/navigation-frame.tsx` | 46 | Radix dialog wrapper for mobile drawer — focus trap, Escape, focus restore to opener |
| `src/app/globals.css` | ~2000 | CSS-first @theme tokens + component + dialog styles, `@import "tailwindcss"`, responsive 1150/900 + 1500 |
| `src/lib/server.ts` | ~150 | Cookie session (64-hex→SHA-256), `assertOrigin` (proxy-aware), `readJson` 3 MB, `errorResponse` (curated copy + requestId), `setSession` Strict Secure |
| `src/lib/origin.ts` | 21 | Pure `isSameOriginRequest` — `Host` OR first `x-forwarded-host`, reject `cross-site`/malformed/non-http(s) |
| `src/lib/validation.ts` | ~50 | All zod schemas — `chatInputSchema` 16k + image + settings strict, `titleSchema` 1–100, `providerChunkSchema` with `reasoning_content` |
| `src/lib/sse.ts` | ~80 | Incremental `SSEParser` — LF/CRLF/CR, split-CRLF `skipLF`, exactly-one-space `data:`, 1M limits, shared server+client |
| `src/lib/types.ts` | ~40 | `ChatMessage`, `ConversationSummary`, `ChatSettings`, `defaultSettings` |
| `src/lib/retention.ts` | ~50 | Pure `pruneIdleSessions` / `pruneStaleConversations` — injected `{db,tables,options}` |
| `src/db/schema.ts` | ~45 | Drizzle `chat_sessions` + `conversations` (JSONB, FK cascade, index) |
| `src/db/index.ts` | ~25 | `pg.Pool` (globalThis cache) + `drizzle(pool)` — throws if `DATABASE_URL` missing |
| `src/db/seed.ts` | ~50 | Idempotent seed — injected `{db,tables}` |
| `drizzle/0000_flimsy_sage.sql` | ~15 | CREATE `chat_sessions`, `conversations`, FK cascade, `owner_updated` index |
| `drizzle.config.ts` | ~15 | `defineConfig({ dialect:"postgresql", schema:"./src/db/schema.ts", out:"./drizzle" })` reads `DATABASE_URL` via `dotenv/config` |
| `next.config.ts` | ~25 | Headers: nosniff, DENY, HSTS `63072000; includeSubDomains`, referrer, permissions-policy, CSP |
| `tsconfig.json` | ~40 | `ES2017`, `bundler`, `strict`, `noEmit`, `@/* → src/*`, excludes `skills/sample-build/docs` |
| `eslint.config.mjs` | ~15 | Flat + `next/core-web-vitals`, `globalIgnores` non-app |
| `playwright.config.ts` | ~30 | `testDir ./tests`, `baseURL TEST_BASE_URL ?? localhost:3000`, workers 1, webServer `npm start` when no `TEST_BASE_URL`, `reuseExistingServer true` |
| `docker-compose.yml` | ~40 | `postgres:17-alpine` `343`→`5432`, `chat_data`, healthcheck, `pgcrypto+pg_trgm` init |
| `package.json` | ~50 | Scripts `dev/build/start/lint/typecheck/test/test:e2e/db:generate|migrate|seed/prune`, deps `next 16.3.4`, `react 19`, `drizzle-orm`, `zod`, `radix-dialog`, `lucide-react`, `react-markdown`, `pg` |
| `.github/workflows/ci.yml` | ~60 | `gates` (secret scan → typecheck → lint → test → build → audit) + `e2e` (postgres:17 service, `db:migrate`, build, `playwright chromium`) — `branches: [main]` |
| `tests/workspace.spec.ts` | ~500 | E2E + API + WCAG + isolation + search + retention |
| `tests/core.test.mjs` | ~120 | Unit — schemas + SSE edge cases |
| `tests/origin.test.mjs` | 139 | Unit — 7 origin gate cases |
| `AGENTS.md` | 70 | Agent ops — 169-line map after doc cleanup |
| `README.md` | 180 | User-facing — features + architecture + quick-start + docker + API + security + testing + tokens + troubleshooting |
| `docs/CODE_REVIEW_REPORT.md` | ~180 | Audit pass 3 ledger — Summary, Verification ledger, 🔴C1/C2 + 🟠H1/H2 + 🟡M1 + 🟢L1/L2 + ⚪I1-6, Passed checks, Backlog, addendum `6be7596` |
| `Project_Architecture_Document.md` | — | **This PAD** — single source of truth |

---

## 12. Glossary

| Term | Definition |
|------|------------|
| **Workspace** | A browser-session–scoped chat context, identified by `kimi_session` cookie’s SHA-256 digest (`owner`). Not a user account. |
| **Owner** | `SHA-256(kimi_session token)` hex digest stored as `sessions.id` and `conversations.owner`; filters every DB query. |
| **Lease** | DB-enforced busy window (`busyUntil` + `lastRequest`) — one generation per session, 3 s spacing, 195 s expiry, 175 s provider timeout; claim via conditional `UPDATE … RETURNING`, release conditional on exact lease value. |
| **Origin gate** | Same-origin check `isSameOriginRequest` accepting `Origin.host === Host` OR `=== first x-forwarded-host`; rejects `sec-fetch-site: cross-site`. |
| **Curated copy** | User-facing error messages that are specific and actionable (“what happened, what to do”) — never generic, never leaking provider internals; `errorResponse` + `apiJson`/`parseOrReload`. |
| **Reasoning** | Provider `reasoning_content` (thinking) — persisted for multi-turn context, stripped from every browser payload (`GET [id]` map + `done` `content` only). |
| **Incremental parser** | `SSEParser.push(chunk)` that handles LF/CRLF/CR, split-CRLF across chunks, exactly-one-space `data:`, and size limits independent of chunk size. |
| **Prune** | Retention CLI `npm run prune -- --idle-days 30 [--conversation-days 90]` — pure `pruneIdleSessions` (cascade) + `pruneStaleConversations`. |
| **Gates** | Pre-commit quality order: `typecheck (next typegen + tsc) → lint → test (15/15) → build (6 routes)` → (if DB/UI touched) `test:e2e`. Never weaken gates. |
| **Sample-build** | Reference build uploaded into `sample-build/` — source of incremental SSE parser + NavigationFrame pattern; excluded from type/lint gates. |

---

**End of PAD v1.0 — validated at HEAD `f888508` (migrate [✓], seed 1→0, build 662 ms, 3004 no-key 12 skipped 16 passed; original Kimi 3003 + Scandi Haven 3000/3001 still up; `chat_data` volume persists).**

