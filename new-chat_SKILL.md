# new-chat SKILL — Kimi Workspace Engineering Reference v1.0

> **Project:** Kimi Workspace (`nordeim/new-chat-app`) · **Scope:** Next.js 16 App Router + React 19 + Tailwind v4 (CSS-first) + Drizzle ORM + PostgreSQL 17 + NVIDIA NIM `moonshotai/kimi-k3`
> **State at distillation:** `cb8a05e` (PAD v1.0) → `f888508` verified (migrate [✓], seed 1→0, build 662 ms, `TEST_BASE_URL=http://localhost:3004` 12 skipped 16 passed) · **Style:** Mint-calm editorial, `kimi.` brand, `WORKSPACE` vertical label
> **Audience:** Future AI agents + senior engineers extending, debugging, or replicating this codebase
> **Companion docs:** `Project_Architecture_Document.md` (definitive blueprint, 12 sections), `README.md` (onboarding), `AGENTS.md` (ops rules), `CLAUDE.md` (six-phase workflow), `docs/CODE_REVIEW_REPORT.md` (pass-3 ledger)
> **Method:** Six-phase distillation (ANALYZE → PLAN → VALIDATE → IMPLEMENT → VERIFY → DELIVER) — every claim traces to a file/command at `cb8a05e`

---

## Table of Contents

1. [Project Identity & Design Philosophy](#1-project-identity--design-philosophy)
2. [Tech Stack & Environment](#2-tech-stack--environment)
3. [Bootstrapping & Configuration](#3-bootstrapping--configuration)
4. [The Design System (Code-First)](#4-the-design-system-code-first)
5. [Component Architecture & Patterns](#5-component-architecture--patterns)
6. [Custom Hooks Deep Dive](#6-custom-hooks-deep-dive)
7. [Content Management & Data Ingestion](#7-content-management--data-ingestion)
8. [Accessibility (WCAG AAA) Implementation](#8-accessibility-wcag-aaa-implementation)
9. [Anti-Patterns & Common Bugs](#9-anti-patterns--common-bugs)
10. [Debugging Guide](#10-debugging-guide)
11. [Pre-Ship Checklist](#11-pre-ship-checklist)
12. [Lessons Learnt & How to Avoid Them](#12-lessons-learnt--how-to-avoid-them)
13. [Pitfalls to Avoid](#13-pitfalls-to-avoid)
14. [Best Practices](#14-best-practices)
15. [Coding Patterns](#15-coding-patterns)
16. [Coding Anti-Patterns](#16-coding-anti-patterns)
17. [Responsive Breakpoint Reference](#17-responsive-breakpoint-reference)
18. [Z-Index Layer Map](#18-z-index-layer-map)
19. [Color Reference (Complete)](#19-color-reference-complete)
20. [The Complete TypeScript Interface Reference](#20-the-complete-typescript-interface-reference)
- [Appendices](#appendices) — A: ADRs · B: Pipeline Costs · C: Audit History · D: Live-Site Validation
- [Quick Reference Card](#quick-reference-card)

---

## 1. Project Identity & Design Philosophy

**One-sentence identity:** Kimi Workspace is a **calm, mint-accented, production-grade chat workspace** — a clean Next.js/PostgreSQL starter that pairs a single client-component UI with server-proxied NVIDIA NIM streaming (`moonshotai/kimi-k3`, OpenAI-compatible SSE) and PostgreSQL/Drizzle persistence, isolated per browser via a `kimi_session` cookie whose SHA-256 digest is the DB owner.

**Design thesis — *Editorial Calm* (mint-calm, not brutalist):**

- **Intentional minimalism:** Whitespace is structure, not emptiness. `welcome` max 918 px, generous `margin auto`, `welcome-description` 13 px/1.9, `composer-area` 918 px, `messages` 850 px — every column has a single max-width, never a generic 12-col grid.
- **Typography as hierarchy:** `welcome h1` `clamp(34px,3.7vw,52px)` with `Georgia` italic span for “a conversation” (`#6d8559`), `welcome-eyebrow` `8px uppercase letter-spacing 2px`, `history-heading` `9px`, category `h2` 12 px/500. No `Inter/Roboto` safety — hierarchy is bespoke.
- **Color as accent, not gradient:** Mint wash `--mint #e8f0e2` for chips/highlights, `--green #306345` for links/brand, `--canvas #fcfdfb` for app, `--sidebar #f5f7f3` for sidebar. No purple-gradient-on-white cliché.
- **Motion as breath:** `welcome-in` 0.6 s ease-out, `pulse` 1.4 s for thinking dots, `fade-in` 0.15–0.2 s for dialogs/toast, `spin` 1.5 s for `Loader2`. Never for decoration — only for state (thinking, opening, entering).

**Non-negotiable rules (AGENTS + `globals.css`):**

1. **No generic grid:** Starter cards `repeat(4,1fr)` → `repeat(2,1fr)` at 900 px → single narrative; not a Bootstrap-12.
2. **No safe font stack:** System `Arial, Helvetica` for UI + `Georgia` italic for editorial moment + `ui-monospace` for code — hierarchy is intentional.
3. **No purple gradients:** Mint/green only; `except` the category icons keep their own muted washes (peach/lavender/yellow/mint) at low saturation.
4. **No card grid without purpose:** `starter-card` hover `translateY(-3px)` + `box-shadow 0 5px 18px #24391d08` — micro-interaction, not decoration; selected state `background #f4f8ef, border #b3c6a1`.
5. **No HTML in model Markdown:** `react-markdown` replaces `img` with `[Image: alt]`, forces `a → target _blank noopener noreferrer`, underlines `offset 3px` — inherited in `--muted` hierarchy.

**CTA hierarchy:**

- Primary: `Send` (`ArrowUp` on `#54763d` → `#365826` hover, `34×34, radius 9`, `box-shadow 0 2px 2px #37552a10`) and `New chat` (`Plus` + `⌘ ⇧ O` hint on `#e4eddc` border `#d2dfc8`).
- Secondary: `prompt-starters` pill `border #e7ebe2, bg #fafbf8 → hover #eaf0e2` + `Copy` (`Copy→Check` 15 px, `9px` label in `response-actions`).
- Destructive: `Delete conversation` → `danger-button #a65647 → #8b3d32`, confirmation `Modal` with `delete-preview`.

**Anti-generic mandate (rejected):**

- `Inter/Roboto` system safety without hierarchy — rejected, hierarchy is `Arial+Georgia+monospace` with explicit sizes.
- `purple-gradient-on-white` hero — rejected, mint wash `#e8f0e2` only.
- Predictable card grids and hero sections — rejected, `welcome-emblem` 72 px `rotate -6deg` + glow, `emblem-star ✦` + 4-card editorial row.
- “AI slop” rounded-card-left-border — rejected, border `11px` + mint wash + bespoke spacing.

**Verification:** Does this section prevent adding a generic Bootstrap component? Yes — any new surface must reuse `--canvas/--sidebar/--mint/--green` tokens and the `Arial+Georgia` hierarchy, never a stock gradient/grid.

---

## 2. Tech Stack & Environment

Locked at `cb8a05e` — every version from `package.json` + lockfile + `drizzle.config.ts` + `next.config.ts` + `docker-compose.yml`.

| Layer | Technology | Version | Critical Note |
|-------|------------|---------|---------------|
| Web Framework | Next.js (App Router, Turbopack) | `16.3.4` | `runtime="nodejs"` + `maxDuration=180` on `/api/chat` for SSE; `next typegen` keeps route params typed — runs before `tsc` (`npm run typecheck = next typegen && tsc --noEmit`). |
| UI Runtime | React + react-dom | `19.3.0` | Single client component (`chat-workspace.tsx` ~1500 lines) handles loading/error/empty/success explicitly; `busy` disables controls while streaming. |
| Language | TypeScript (strict) | `5.9.3` | `strict: true`, `noEmit: true`, `isolatedModules: true` → `--experimental-strip-types` viable for unit; no `any` (`unknown` + narrowing). |
| Styling | Tailwind CSS (CSS-first) + PostCSS | `4.3.3` + `@tailwindcss/postcss 4.3.3` / `postcss 8.5.28` | CSS-first `@theme` in `globals.css` — no `tailwind.config.js`; tokens single-source `--mint` etc. |
| Primitives | Radix UI Dialog | `1.1.23` | Only outside primitive — mobile drawer modal (focus trap, Escape, `onCloseAutoFocus` → opener). |
| Validation | zod | `4.6.1` | Single home `src/lib/validation.ts` — shared server/client/unit; `safeParse` at every boundary. |
| ORM + Driver | Drizzle ORM + `pg` + `drizzle-kit` | `0.45.2` / `8.23.0` / `0.31.10` | Parameterized only; JSONB `messages`; journal `drizzle/meta/_journal.json` + SQL `drizzle/0000_flimsy_sage.sql` (15 lines). |
| DB | PostgreSQL | `17-alpine` (local), `14+` compat | `postgres:17-alpine`, `chat_data` volume, `pgcrypto` (gen_random_uuid) + `pg_trgm` init, `5433:5432`. |
| AI Provider | NVIDIA NIM (OpenAI-compat) | `https://integrate.api.nvidia.com/v1/chat/completions` `moonshotai/kimi-k3` `stream:true` `Accept: text/event-stream` | Server-only `NVIDIA_API_KEY` (never `NEXT_PUBLIC_`); `temperature 1`, `max_tokens 16384`, `reasoning_effort max` defaults; `image_url` blocks; `reasoning_content` persisted then stripped. |
| Icons / MD | lucide-react + react-markdown + remark-gfm | `1.43.0` / `10.1.0` / `4.0.1` | `KimiMark` bespoke SVG + 20+ lucide; markdown `a→_blank noopener`, `img→[Image]` sanitized. |
| Testing — Unit | node:test | Node ≥22 | `--experimental-strip-types` keeps imports `.ts` with explicit `.ts` extensions; 15 tests ~300 ms. |
| Testing — E2E/WCAG | Playwright + @axe-core/playwright | `1.63.0` / `4.13.0` | `workspace.spec.ts` 12 + `stream-ui` 4 + `live-site` 12 gated; `workers:1`, `timeout 60s`, `reuseExistingServer:true`. |
| Build | Next Turbopack + tsc + ESLint flat | `eslint 9.39.5` / `eslint-config-next 16.3.4` | `eslint.config.mjs` `globalIgnores` non-app; `typecheck` is `next typegen` then `tsc`. |
| Local Infra | Docker Compose | `chat_data` `chat_net` bridge | `new_chat_postgres` `healthy` 5s interval; `5433:5432` avoids Scandi Haven `5432`. |
| CI | GitHub Actions + postgres:17 service | Node 22 | `gates` (secret scan→typecheck→lint→test→build→audit) + `e2e` (service PG, `db:migrate`, build, `playwright chromium`) on `branches: [main]`. |

**Env vars (4 total):** `DATABASE_URL` ✅ (throw at `src/db/index.ts` import if missing), `NVIDIA_API_KEY` (for chat, 503 when missing), `TEST_BASE_URL` (default `http://localhost:3000`), `LIVE_SITE_URL` (gates `live-site.spec.ts`). `.env` is untracked + `.gitignore:10:.env` (after late `272d7ff`; `dc1c664` claim did not take effect at `eb654aa` — addendum `6be7596`).

---

## 3. Bootstrapping & Configuration

### 3.1 Scaffold (how this project was born)

```bash
npx create-next-app@latest new-chat-app --typescript --eslint --tailwind --app --import-alias "@/*"
cd new-chat-app
npm ci                         # not npm install — lockfile-pinned
cp .env.example .env           # set DATABASE_URL=postgresql://chat_user:chat_secret@127.0.0.1:5433/chat_db
sudo docker compose up -d      # postgres:17-alpine on 5433, chat_data volume, pgrypto+pg_trgm init (10s healthcheck)
npm run db:migrate             # drizzle-kit migrate — [✓] migrations applied
npm run db:seed                # {operation:"db.seed",inserted:1} then {inserted:0} idempotent
npm run build                  # next build Turbopack — 6 routes, 662 ms compile
npm run dev                    # http://localhost:3000 — mint workspace (or PORT=3004 when 3000 busy)
# if 3000 busy (Scandi Haven): PORT=3004 npm start -- --port 3004 + TEST_BASE_URL=http://localhost:3004 npx playwright test
```

### 3.2 Critical Config Files (no `tailwind.config.js`)

| File | Purpose | Key rule |
|------|---------|----------|
| `tsconfig.json` | `target ES2017`, `jsx react-jsx`, `strict/noEmit/isolatedModules/bundler`, `baseUrl .`, `paths @/* → src/*`, `include next-env + **/*.ts/tsx + .next/types`, `exclude node_modules/skills/sample-build/docs` | Excludes reference material — never app code; never remove excludes. |
| `next.config.ts` | `async headers() → X-Content-Type-Options nosniff, X-Frame-Options DENY, Strict-Transport-Security max-age=63072000; includeSubDomains; preload, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy camera/microphone/geolocation=(), CSP frame-ancestors 'none'; base-uri 'self'; object-src 'none'` | Headers versioned with code — keep intact. |
| `eslint.config.mjs` | `defineConfig([...nextCoreWebVitals, globalIgnores(.next/out/build/next-env/skills/sample-build/docs)])` | Non-app is type/lint-excluded. |
| `postcss.config.mjs` | `{ plugins: {"@tailwindcss/postcss": {}} }` | Wires Tailwind v4 CSS-first. |
| `drizzle.config.ts` | `import "dotenv/config"`, `if (!DATABASE_URL) throw`, `defineConfig({ dialect:"postgresql", schema:"./src/db/schema.ts", out:"./drizzle", dbCredentials:{url: DATABASE_URL}, verbose:true, strict:true })` | Single source `DATABASE_URL` — no hard-coded sandbox URL; `npx drizzle-kit push --url="$DATABASE_URL"` for tooling. |
| `playwright.config.ts` | `testDir ./tests`, `timeout 60_000`, `fullyParallel false`, `workers 1`, `reporter line`, `baseURL TEST_BASE_URL ?? http://localhost:3000`, `trace retain-on-failure`, `projects chromium Desktop Chrome`, `webServer: npm start, url localhost:3000, reuseExistingServer true` (skipped when `TEST_BASE_URL` set) | E2E needs `npm run build && npm start` + disposable `DATABASE_URL` + no `NVIDIA_API_KEY`. |
| `docker-compose.yml` | `postgres:17-alpine`, `container_name new_chat_postgres`, `POSTGRES_DB chat_db`, `POSTGRES_USER chat_user`, `POSTGRES_PASSWORD chat_secret`, `ports 5433:5432`, volumes `chat_data` + `infrastructure/postgres/init`, healthcheck `pg_isready -U chat_user -d chat_db` 5s interval 10 retries, network `chat_net` | `5433` avoids host `5432` clash with sibling `scandihaven_postgres`. |
| `infrastructure/postgres/init/00-create-extensions.sql` | `CREATE EXTENSION IF NOT EXISTS pgcrypto` (gen_random_uuid) + `pg_trgm` + `RAISE NOTICE` | Runs once on first `chat_data` creation. |
| `.github/workflows/ci.yml` | `on push branches [main] + pull_request`, jobs `gates` (secret scan `git grep -lIE 'nvapi-…|PRIVATE KEY|ghp_|AKIA' -- . ':!package-lock.json'` → typecheck→lint→test→build→`npm audit --omit=dev`) + `e2e` (postgres:17 service `5432`, `DATABASE_URL postgresql://postgres:postgres@127.0.0.1:5432/app_db`, `db:migrate`, build, `playwright install chromium --with-deps`, `npx playwright test`, artifact `test-results/` 7 days) | Fixed from `branches: ain]` at `dc1c664`; gate order `typecheck→lint→test→build` never weakened. |

### 3.3 Dependencies Install

```bash
npm ci                       # uses package-lock.json 368 KB, allowScripts {esbuild 0.18.20, 0.25.12, 0.28.2}
# Runtime: @radix-ui/react-dialog, dotenv, drizzle-orm, lucide-react, next, pg, react, react-dom, react-markdown, remark-gfm, zod
# Dev: @axe-core/playwright, @playwright/test, @tailwindcss/postcss, @types/*, drizzle-kit, eslint, eslint-config-next, postcss, tailwindcss, typescript
```

**Verification:** A new engineer following 3.1 gets `curl http://localhost:3000 → Kimi — A little more possible` + `curl /api/health → {"ok":true}` within 5 min.

---

## 4. The Design System (Code-First)

**Single source:** `src/app/globals.css` — `@import "tailwindcss"` then `:root` tokens + component styles. No `tailwind.config.js` — drift dies here.

### 4.1 @theme Tokens

```css
:root {
  --canvas: #fcfdfb;   /* App background */
  --sidebar: #f5f7f3;  /* Sidebar surface */
  --surface: #fff;     /* Composer/dialog */
  --ink: #26362f;      /* Primary text */
  --muted: #5f6c55;    /* Secondary */
  --subtle: #626e65;   /* Tertiary */
  --line: #e5e9e2;     /* Borders */
  --green: #306345;    /* Primary accent, links, brand */
  --green-dark: #244d36; /* Hover */
  --mint: #e8f0e2;     /* Mint wash */
  --focus: #60926f;    /* Focus ring */
  --danger: #a44539;   /* Destructive */
  --radius: 14px;      /* Rounding */
}
```

Category washes: `.peach bg #faede4 / #bd8d71`, `.lavender #f0edf9/#9b8cb2`, `.yellow #f7f1dd/#baa05d`, `.mint bg #eaf2e5/#82996a`.

### 4.2 Typography

- UI: `Arial, Helvetica, sans-serif` (system sans).
- Editorial moment: `welcome h1 span` → `Georgia, "Times New Roman", serif` italic `#6d8559`.
- Code: `markdown pre/code` → `ui-monospace, SFMono-Regular, Menlo, monospace` 12 px.
- Hierarchy: `welcome h1 clamp(34px,3.7vw,52px) -2px`, `markdown h1 23px`, `h2 19px`, `h3 16px` `-0.3px`; `welcome-eyebrow 8px 2px uppercase #8a987d`; `history-heading 9px #7d8777 →10px` at wide; `sidebar-links 11→12px`; `composer textarea 12→13px`; `welcome-description 13px 1.9` (`#8b9485`), `field-note 11px`, `dialog-description 13px`.

### 4.3 Keyframes (4)

| Name | Duration | Purpose | Notes |
|------|----------|---------|-------|
| `welcome-in` | 0.6 s ease-out | Welcome entrance `opacity 0→1, translateY 7→0` | Editorial breath |
| `pulse` | 1.4 s infinite, stagger 0.2 s | Thinking dots `opacity 0.4→1, translateY 0→-3` | `thinking-indicator > span:nth-child(2,3)` delay |
| `spin` | 1.5 s linear infinite | `Loader2` + opening state | `opening-state .spin` |
| `fade-in` | 0.15–0.2 s | `dialog-overlay/content`, `toast` `opacity 0→1` | Radix open + toast |

### 4.4 Utilities & Components (bespoke, not Radix except Dialog)

- **Composer:** `background white, border #dce4d3, radius 15px, shadow 0 3px 4px #29441403 + 0 8px 30px #40582804`; `:focus-within border #aabf94, shadow 0 0 0 3px #d6e4c829`. `textarea 51px min, 160px max, 12px #40533a`, `::placeholder #a0a797`; buttons `Plus 21`, `Brain`, `Attach`, `Send 34×34 #54763d→#365826`, `stop #597444`.
- **Starter cards:** `4→2 cols` at 900 px, `bg #ffffffbd border #e2e7dc radius 11px`, hover `bg white border #b9c9aa shadow 0 5px 18px translateY(-3px)`, selected `bg #f4f8ef border #b3c6a1`; `category-icon 32→28 px`; `starter-arrow #b1baa9`.
- **Sidebar:** `264px (282≥1500, 237≤1150), bg var(--sidebar), border-right #e5e9e2`, `brand 32px -1.9px #283c2e` + `brand-dot #719570` + `WORKSPACE vertical-rl 7px #758171`; `new-chat #e4eddc border #d2dfc8`; `conversation-item active #e5ecdd #3e6042`.

See §19 for full color reference; `globals.css` is 2000 lines — this section is a distilled view, not a substitute for reading it.

### 4.5 Shadows & Radius

- `--radius 14px` base; `welcome-emblem 22px`, `starter-card 11px`, `composer 15px`, `dialog 19px`, `toast 10px`.
- Shadows: `new-chat 0 2px 3px #31452e03`, `starter hover 0 5px 18px`, `composer 0 3px 4px + 0 8px 30px`, `dialog 0 24px 90px #17251b30`.

---

## 5. Component Architecture & Patterns

### 5.1 Layer Model (Golden Rule)

```
Layer 0: Edge — TLS ingress (Cloudflare/nginx/ALB).  Rule: Preserve public Host OR set x-forwarded-host to public host. No untrusted proxy-header path.
Layer 1: App Router — src/app/api/* handlers.       Rule: Owner-scoped; writes need isSameOriginRequest + requireSession/ensureSession; reads owner-filtered; only POST /api/chat touches NIM.
Layer 2: Domain — src/lib + src/db.                Rule: Zod at boundaries; origin pure (no Next/DB); SSE shared; types single source; DB parameterized only.
Layer 3: Features — src/components.               Rule: One client component owns workspace; validates every API/stream payload via apiJson/parseOrReload; derived state out of useState; no setState in effects (queueMicrotask).
Layer 4: Persistence — pg.Pool + PostgreSQL.       Rule: Migrations journal-driven SQL; seed idempotent; retention pure {db,tables,options}.
```

**Golden Rule:** *Server is the authority.* Client mirrors for UX only. No silent failure — curated copy + structured logs (`operation/ids/errorType`, never content/cookie/key). Streaming integrity — only `completed && assistant.content` persists.

### 5.2 Component Directory Map

```
src/
├── app/
│   ├── layout.tsx           # 20 lines — <html lang="en">, metadata.title Kimi, robots noindex
│   ├── page.tsx             # 3 lines — renders <ChatWorkspace />
│   ├── globals.css          # ~2000 lines — @theme + all component styles (see §4)
│   └── api/
│       ├── chat/route.ts    # 350 lines — see §15 Pattern 1/2 (lease + SSE)
│       ├── conversations/
│       │   ├── route.ts     # 70 lines — GET list/search ?q= (title+JSONB content, owner-filtered, escaped, limit 100, desc, configured flag, sets kimi_session)
│       │   └── [id]/route.ts# 130 lines — GET (strip reasoning)/PATCH (1-100, no-store)/DELETE (FOR UPDATE +409 if busy), all owner-scoped via identity()
│       └── health/route.ts  # 15 lines — db.execute(select 1) → {ok:true}/500, no provider
├── components/
│   ├── chat-workspace.tsx   # 1572 lines — single client component (see §5.3)
│   └── navigation-frame.tsx # 46 lines — Radix wrapper (see §5.3)
├── db/
│   ├── index.ts             # 25 lines — Pool (globalThis cache) + drizzle(pool), throws if no DATABASE_URL
│   ├── schema.ts            # 45 lines — chat_sessions + conversations (JSONB, FK cascade, index)
│   └── seed.ts              # 50 lines — idempotent injected {db,tables}
└── lib/
    ├── origin.ts            # 21 lines — pure isSameOriginRequest
    ├── retention.ts         # 50 lines — pure pruneIdleSessions/pruneStaleConversations
    ├── server.ts            # 150 lines — ApiError, sessionId/ensureSession/setSession, assertOrigin, readJson 3MB, errorResponse
    ├── sse.ts               # 80 lines — incremental SSEParser (shared)
    ├── types.ts             # 40 lines — ChatMessage etc.
    └── validation.ts        # 50 lines — all zod schemas
```

**Client vs Server:** `src/components/*` + `src/app/globals.css` are client/runtime; `src/app/api/*` + `src/lib/server.ts` + `src/db/*` are server-only. `origin.ts` + `sse.ts` + `validation.ts` + `types.ts` are shared. `origin.ts` intentionally has zero `next/headers`/`pg` imports so `node:test` can import it.

### 5.3 Client Component — `chat-workspace.tsx` (1572 lines)

- **Categories:** `write` (PenLine, peach, 3 prompts), `code` (Code2, lavender), `idea` (Lightbulb, yellow), `image` (ImageIcon, mint) — `categories` array, `selectedCategory?.prompts ?? starters`.
- **State:** `history` (ConversationSummary[]), `currentId`, `messages` (ChatMessage[]), `draft` (16k max), `attachment` (`{data,name}` data-uri), `settings` (ChatSettings), `ready/configured/busy/loadingChat/thinking`, `error/toast`, `category/mobileOpen/sidebarCollapsed/modal` (`search|settings|help|model|rename|delete`), `search/serverResults`, `rename/mutationBusy`, `copied`, refs `textarea/fileInput/abortRef/bottomRef/openingRef`.
- **Key flows:**
  - `refresh()` → `fetchWorkspace()` → `GET /api/conversations` → `setHistory/setConfigured/setReady` (curated `Could not load… Please reload` on fail, no raw leak).
  - `search` debounce 250 ms → `GET /api/conversations?q=` → `serverResults` else degrade to local `filteredHistory` (`queueMicrotask` avoids set-state-in-effect).
  - `openConversation(id)` → `GET /api/conversations/[id]` → `parseOrReload` → `setCurrentId/setMessages` (race guard `openingRef`).
  - `sendMessage` → new `user` + `assistant ""` optimistically → `POST /api/chat` (SSE via `SSEParser`, `streamEventSchema`, `meta→thinking→delta→done/error`) → `meta` updates `history`, `thinking`/`delta` update `assistant.content`, `done` replaces, `error` → curated `setError` + restore `previousMessages` if not `accepted` else `base`, retry via `messages.at(-1)` when `role===user`. Abort via `abortRef`.
  - `mutateConversation` rename/delete → `PATCH/DELETE` + `same-origin` + `Content-Type json`, toast.
  - `upload(file)` → PNG/JPEG/WEBP + 2 MB check → `FileReader.readAsDataURL` → `setAttachment`, default draft `What can you tell me…` if empty.

### 5.4 Navigation Frame — `navigation-frame.tsx` (46 lines)

```tsx
// When closed: render children in place. When open: Radix modal
if (!open) return children;
return (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Overlay asChild><button className="mobile-scrim" aria-label="Close navigation" onClick={() => onOpenChange(false)} /></Dialog.Overlay>
    <Dialog.Content asChild aria-describedby={undefined}
      onCloseAutoFocus={(e) => { e.preventDefault(); document.querySelector('[aria-label="Open navigation"]')?.focus(); }}>
      {children}
    </Dialog.Content>
  </Dialog.Root>
);
```

Radix hides `Overlay` from AT, so `.sidebar-close` lives inside drawer (`chat-workspace.tsx:645`), visible only while `mobile-open`; `collapse-button` hidden in that state.

### 5.5 Auth & Query Boundary

- **Auth pattern:** `ensureSession(req)` on list (`GET /api/conversations`) — generates if missing/invalid, `onConflictDoNothing`, `setSession(cookie)`. Others use `requireSession()` → 401 curated (`Your session expired. Reload…`). `sessionId()` validates `^[a-f0-9]{64}$` → `SHA-256`.
- **Query pattern:** All `conversations` access via `eq(owner)` or `identity()` condition (`and(eq(id, param), eq(owner, hash))`). Search uses `searchPattern(term) = %${term.replace(/[\\%_]/g,"\\$&")}%` → `ilike(title, pattern)` + `sql exists (jsonb_array_elements(messages) →>'content' ilike pattern)` bound, `desc(updatedAt)`, `limit 100`.

---

## 6. Custom Hooks Deep Dive

**This project has no `src/hooks` directory — intentionally.** The single client component uses `useCallback/useEffect/useRef/useState` directly. This avoids hook abstraction for single-use code (ponytail principle). The “hooks” this section covers are the *patterns* that would become hooks if reused.

| Pattern | Location | Signature & Detail | Why it matters | Cleanup / SSR |
|---------|----------|--------------------|----------------|---------------|
| Workspace refresh | `chat-workspace.tsx: refresh()` | `useCallback(() => { let cancelled=false; fetchWorkspace().then(data=>{if(cancelled)return;setHistory…}) return ()=>{cancelled=true}}) ` + `useEffect(()=>refresh(),[refresh])` | `cancelled` flag ignores stale responses; state updates only in async callbacks (no sync `setState` in effect). | `queueMicrotask` for `serverResults null` avoids `react-hooks/set-state-in-effect` error. |
| Search debounce | `chat-workspace.tsx: search effect` | `term=search.trim(); if(!term) queueMicrotask(()=>setServerResults(null)); else { const controller=new AbortController(); const t=setTimeout(()=>fetch(q, {signal}),250); return ()=>{controller.abort();clearTimeout(t)} }` | 250 ms debounce + `AbortController` cancels in-flight on term change; previous results stay visible while loading; network fail degrades to local `filteredHistory`. | Cleanup aborts + clears timer; no `useState` in sync effect body. |
| Scroll to bottom | `chat-workspace.tsx` | `useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"instant",block:"end"})},[messages,thinking])` | Keeps streamed answer in view (`instant` avoids jank). | No cleanup. |
| Toast expiry | `chat-workspace.tsx` | `useEffect(()=>{if(!toast)return; const t=setTimeout(()=>setToast(""),3500); return ()=>clearTimeout(t)},[toast])` | Auto-dismiss 3.5 s. | Clears on change. |
| Abort on unmount | `chat-workspace.tsx` | `useEffect(()=>()=>abortRef.current?.abort(),[])` | Streaming `fetch` aborted if component unmounts (no orphaned reader). | Leverages `AbortSignal.any([aborter.signal, req.signal, AbortSignal.timeout(175_000)])` on server. |
| Stream consume | `chat-workspace.tsx: sendMessage` | `reader= response.body.getReader(), decoder, parser=new SSEParser(), consume(events)=>{for(v of events){item=streamEventSchema.parse(JSON.parse(v)); if(meta) setCurrentId+history; if(thinking) setThinking; if(delta) setMessages(append); if(done) replace; if(error) throw}} while(!done){read; consume(parser.push(decoder.decode(value,{stream:true})))} finally{reader.cancel();releaseLock}` | Parses incrementally; `streamEventSchema` zod validates every event; `meta` early sets `accepted`; failure restores `previousMessages` if `!accepted`. | `finally` cancels + releases. |
| Keyboard shortcuts | `chat-workspace.tsx` | `useEffect(()=>{window.addEventListener("keydown",handler=>{if(Cmd/Ctrl+K) setModal("search"); if(Cmd/Ctrl+Shift+O) newChat()}) return=>remove},[newChat])` | `⌘K` search, `⌘⇧O` new chat (mirrors `key-hint` on New chat). | Removes listener. |

**SSR safety:** All window/document access is inside `useEffect`/handlers, never during render. `document.querySelector` in `onCloseAutoFocus` is guarded by `event.preventDefault()` + optional chaining.

**If these patterns recur,** extract `useWorkspaceSearch(term)`, `useStreamedChat(currentId)`, `useAutoScroll(deps)` — but until then, keep them inline (shortest correct diff).

---

## 7. Content Management & Data Ingestion

**This project ingests no external CMS or RSS** — it is a chat workspace, not a content site. “Content” here means conversations + provider reasoning, stored as JSONB messages.

### 7.1 Static Data — Locked Arrays

| Array | Location | Entries | Regression test |
|-------|----------|---------|-----------------|
| `categories` | `chat-workspace.tsx: categories` | 4 objects (write→peach/PenLine, code→lavender/Code2, idea→yellow/Lightbulb, image→mint/ImageIcon) each with `title`, `description`, `prompts[3]` | Screenshot `workspace.spec.ts: welcome, prompt starters…` covers render |
| `starters` | `selectedCategory?.prompts ?? [3 default]` | Defaults: `Make a plan…`, `Explain something…`, `Help me get inspired` | `fillPrompt(prompt)` tested |
| `summarySchema/messageSchema/streamEventSchema` | `chat-workspace.tsx` | `summary {id,title,updatedAt}`, `message {id,role,content,image?}`, `streamEvent discriminatedUnion meta/thinking/delta/done/error` | `apiJson` + `parseOrReload` guard degraded HTML |

No `import.meta.glob` — Next.js App Router uses typed route handlers, not glob.

### 7.2 Adding New Content (procedures)

- **New category:** Edit `categories` array in `chat-workspace.tsx` (add `{id,title,description,icon,color,prompts[3]}`), add CSS `.color` in `globals.css` if new wash, ensure `starter-grid` still fits (4→2 cols at 900 px). No other files.
- **New prompt:** Add string to `prompts` array for a category (max ~30 chars UI). No DB change.
- **New model setting:** Extend `ChatSettings` + `defaultSettings` in `lib/types.ts`, add zod in `validation.ts` (`chatInputSchema.settings`), add UI `setting-field` in `chat-workspace.tsx` `settings` modal, and pass `temperature/maxTokens/reasoningEffort` in `route.ts` `body: JSON.stringify({model, stream, temperature: input.settings.temperature, …})`.
- **New conversation flow:** No schema change needed — `messages` JSONB is append-only; just `db.insert/update` with `ChatMessage[]`. Title is first prompt sliced `0..70`.

### 7.3 Why Not `import.meta.glob`

Next.js App Router discovery is `src/app/**` file routes; chat history is `GET /api/conversations` (DB), not file ingest. Static `categories` are code, not content files — typed arrays are the boundary.

---

## 8. Accessibility (WCAG AAA) Implementation

Target: **WCAG 2.2 AA** (axe `wcag2a, wcag2aa, wcag21aa, wcag22aa`) on welcome, dialogs, **and error state** — verified green (report pass 3). AAA is the *floor* aimed, AA is the axe tag set (AAA not fully automatable).

### 8.1 Color Contrast (axe-verified)

| Pair | Ratio | Spec |
|------|-------|------|
| `--ink #26362f` on `--canvas #fcfdfb` | >7:1 | AAA |
| `--green #306345` on `--mint #e8f0e2` | ≥4.5:1 | AA (error banner raised to 4.5:1+ at pass 2) |
| `--muted #5f6c55` on warm white (`#fafaf8`) | ≥4.5:1 after raise (shared secondary on mint — see report L1) | AA |
| `error-banner #fffaf0` border `#e8d9bc` text `#6f5c30` | ≥4.5:1 | AA |
| Focus `outline #60926f` | visible 2 px offset 4 px | AAA focus |

*Source:* `src/app/globals.css` warm-white/mint surfaces + `report` L1 fix (error-banner contrast raised).

### 8.2 Focus & Keyboard

- **Focus ring:** `button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--focus); outline-offset: 4px }`; `textarea:focus-visible` has inner `outline 2px solid #b4c5a6 offset 5px` inside composer.
- **Skip:** No skip-to-content link (single column + sidebar; future hardening could add `#main`).
- **Radix focus:** `NavigationFrame` traps focus while `mobileOpen`, Escape closes, `onCloseAutoFocus` (preventDefault + `querySelector('[aria-label="Open navigation"]')?.focus()`) restores to opener — tested `workspace.spec.ts: mobile navigation closes on Escape and restores focus`.
- **Shortcuts:** `⌘K` → search, `⌘⇧O` → new chat, `Enter` to send (Shift+Enter newline), `Escape` to close dialogs/drawer.
- **Disable while busy:** `disabled={busy}` on New chat, conversation items, inputs, etc.; `composer.is-busy` hides send, shows `stop-button`.

### 8.3 Touch & Motion

- **Touch targets:** `new-chat 12px 13px`, `icon-button 30×30 radius 7`, `send-button 34×34`, `conversation-item 11px 15px` — all ≥24 px, most ≥30 px.
- **Reduced motion:** `playwright.config.ts` `reducedMotion: "reduce"`; no `prefers-reduced-motion` media query yet — additive change would wrap `pulse/spin/welcome-in` in `@media (prefers-reduced-motion: reduce) { animation: none }` (backlog I5).

### 8.4 ARIA Patterns per Component

| Component | Pattern |
|-----------|---------|
| Mobile drawer | `Dialog.Root` + `Dialog.Overlay` + `Dialog.Content asChild` (`aria-describedby={undefined}`), `aria-label="Workspace navigation"` on `aside`, `aria-label="Open navigation"` on opener, `aria-label="Close navigation"` inside drawer (`.sidebar-close`). |
| Modals | `Dialog.Root` + `Overlay` + `Content` + `Dialog.Title` + `Dialog.Description` + `Dialog.Close aria-label="Close dialog"` (all `modal === "search"/"settings"/…`). |
| Composer | `label.sr-only for="message"` + `textarea id="message" aria-label="Message Kimi"` + `input type=file accept png/jpeg/webp sr-only` + `aria-label="Attach an image"`/`Remove attachment` etc. |
| Messages | `messages` `aria-label="Conversation" aria-busy={busy}`, `article.message.user/assistant` with `message-author` (`Kimi K3`) |
| Alerts | `error-banner role="alert"` |
| Conversation list | `nav aria-label="Saved conversations"` + `history-heading` span + `YO UR CONVERSATIONS` heading |

**Verification:** `npx playwright test` with `AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa","wcag22aa"]).analyze()` on welcome + dialogs + error → `violations: []`.

---

## 9. Anti-Patterns & Common Bugs

*Distilled from 3 audit passes (8 + 6 commits), session_1.md worklog, and codebase archaeology. Each entry is a bug that was fixed so it never recurs; severity matches `CODE_REVIEW_REPORT.md`.*

| # | Anti-Pattern (symptom → root → fix → lesson) | Sev | Files |
|---|-----------------------------------------------|-----|-------|
| **AP-001** | **Host-only origin check → chat 403 behind Cloudflare** — Every browser `POST /api/chat` returned 403 despite correct `Origin`; ingress rewrote `Host` to upstream, forwarded `x-forwarded-proto: https` (Secure cookie proof) but gate only checked `Origin.host===Host`. Fix: `origin.ts` pure `isSameOriginRequest` accepts `Host OR first x-forwarded-host`, rejects `cross-site`, 7 unit tests + API regression `400 not 403` when proxied. Lesson: test live behind ingress, never assume Host preservation. | 🟠 H1, CRITICAL | `origin.ts` 21, `server.ts`, `origin.test.mjs` 139, `workspace.spec.ts` +58 |
| **AP-002** | **`.env` tracked with live `nvapi-` key (public on GitHub)** — Added `7afe083`, claimed untracked `dc1c664` but `--stat` was `ci.yml + prompt-to-create.md` only, no `.env` deletion; at `eb654aa` `git ls-tree` still `100644` + `git grep nvapi-` hit `.env`. Fix: `272d7ff` actually `git rm --cached .env`, `.gitignore:10:.env` now effective, addendum `6be7596`. Lesson: `git rm --cached` must appear in diff; `.gitignore` has no effect on tracked files. | 🔴 C2 | `.env`, `.gitignore`, `CODE_REVIEW_REPORT.md` addendum |
| **AP-003** | **CI `branches: ain]` — never ran on `main`** — Push to `main` matched nothing, gates+E2E silently skipped (only `pull_request` fired); `cat -A` revealed corruption. Fix: `branches: [main]` + secret-scan + `npm audit --omit=dev` in `dc1c664`. Lesson: `docker compose down -v` is not the only cold-start test — `git push` must exercise CI. | 🟠 H2 | `.github/workflows/ci.yml` 7 |
| **AP-004** | **Live streaming test false “streamed”** — Raced on prompt text (`/live check ok/i`) satisfied by optimistic user bubble, so failed send passed; `Copy response` then failed misleadingly. Fix: wait for nonce inside `.message.assistant` only, treat error banner as failure with banner text, assert Copy, check persistence via `GET /api/conversations`. Lesson: scope streaming asserts to assistant, never user. | 🟡 M1 | `tests/live-site.spec.ts` 75 |
| **AP-005** | **Buffer-concat SSE parser → chunk-boundary failures** — `split("\n\n")` mishandled lone-CR, split CRLF (`A\r` + `\nB`), size limits depended on chunk size. Fix: incremental `SSEParser` (`fragments/lineLength/data/skipLF`, exactly-one-space, `MAX 1_000_000` incremental). Lesson: share one parser server+client, test with `push()` split at every boundary. | 🟢 E2 | `lib/sse.ts` 65, `core.test.mjs` 29 |
| **AP-006** | **Mobile drawer no focus containment / no Escape / no focus restore** — Scrim `z-29` vs sidebar `z-30`; backdrop `aria-hidden` hides close control. Fix: `NavigationFrame` Radix `Dialog.Root`, `Overlay asChild .mobile-scrim`, `Content asChild + onCloseAutoFocus → opener`, in-drawer `.sidebar-close`. Lesson: Radix Portal + `asChild` keeps markup, `aria-hidden` backup needs in-drawer affordance. | 🟢 E3 | `navigation-frame.tsx` 46, `globals.css` 9, `chat-workspace.tsx` 27, `workspace.spec.ts` Escape test |
| **AP-007** | **Naive `searchPattern` without escaping** — `%`/`_`/`\` in term became LIKE wildcards. Fix: `term.replace(/[\\%_]/g,"\\$&")` before `ilike` + `jsonb` `ilike`. Lesson: wildcard-escape at the boundary, not in callers. | — | `api/conversations/route.ts` |
| **AP-008** | **`git ls-files` shows `.env` → secret scan hits `.env` → CI fails** — `.env` tracked despite `.gitignore`; `git grep … -- . ':!package-lock.json'` hits it. Fix: untrack + scope scan (or add `':!skills/**' ':!sample-build/**' ':!docs/**'` for reference material). Lesson: `.gitignore` does not retroactively untrack. | — | `.gitignore`, `ci.yml` |
| **AP-009** | **`reuseExistingServer: true` serves stale build** — `npm start` from earlier run still bound to 3000, new build not picked up (Escape test failed until rebuild). Fix: rebuild before `npx playwright test` when `reuseExistingServer` is true; or kill prior server. Lesson: E2E port discipline (`3003 Kimi prod` vs `3000 Scandi Haven`). | — | `playwright.config.ts` |
| **AP-010** | **Missing-key E2E fails when real `NVIDIA_API_KEY` present** — `reports missing provider key without discarding the draft` expects 503 `Connect NVIDIA` but gets streaming attempt when key exists. Fix: run that server with `NVIDIA_API_KEY=` (or `3004 no-key` prod as in rebuild). Lesson: E2E precondition `no NVIDIA_API_KEY` is contractual — enforce via env override `NVIDIA_API_KEY= PORT=3004`. | — | `tests/workspace.spec.ts` missing-key, `.env` |
| **AP-011** | **`sample-build` reference drift** — `workspace-polish.css` targets sample-build’s stylesheet, not this app’s `globals.css` (adopting would stack contradictory rules). Fix: adopt only `NavigationFrame` + incremental parser, reject polish override (rationale in report I4). Lesson: not all sample-build assets are upgrades. | ⚪ I4 | `sample-build/workspace-polish.css` |
| **AP-012** | **100-conversation cap transient exceed by 1** — `count(*) → insert` races under concurrent creates (bounded, self-corrects via retention). | ⚪ I1 | `api/chat/route.ts` |
| **AP-013** | **`busyUntil` lease conflict has no API 429 test** — requires valid provider key to reach lease; unit cannot cover `UPDATE … WHERE busyUntil < now` without seam. | ⚪ I2 | `api/chat/route.ts` |
| **AP-014** | **CSP minimal (`frame-ancestors 'none'; base-uri 'self'; object-src 'none'`)** — nonce `script-src` remains deployment-specific hardening. | ⚪ I3 | `next.config.ts` |

*Total distilled: 14 (4 Sev High/Critical fixed red→green, 10 Medium/Low/Info documented). See §12 for narrative lessons.*

---

## 10. Debugging Guide

| Symptom | Cause | Fix | Evidence |
|---------|-------|-----|----------|
| **App fails to start: `DATABASE_URL is required`** | `.env` missing/empty or `DATABASE_URL` typo; `src/db/index.ts` throws at import (every API route imports `db`) | `cp .env.example .env` → set `DATABASE_URL="postgresql://chat_user:chat_secret@127.0.0.1:5433/chat_db"` → restart; `sudo docker compose up -d` if container down | `src/db/index.ts:7` throw |
| **`/api/health` → `{ok:false}` 500 while page loads** | PG unreachable (container not healthy, volume `chat_data` deleted without `db:migrate`, wrong port `5432` vs `5433`) | `sudo docker ps` → `new_chat_postgres` healthy; `sudo docker logs new_chat_postgres` tail `ready`; `npm run db:migrate`; `curl /api/health` → `{"ok":true}`; restart `npm start` after fixing | `health/route.ts` `db.execute(select 1)` |
| **“Connect NVIDIA…” banner on send** | `NVIDIA_API_KEY` missing from server env (by design when unset) | Add `NVIDIA_API_KEY="nvapi-…"` to **server** env (never `NEXT_PUBLIC_`) + restart; UI works without it (draft preserved) | `chat/route.ts` 503 `Connect NVIDIA… Your message is still here.` |
| **429 “A response is already running…”** | Lease held (`busyUntil` future) or 3 s spacing violated; `POST /api/chat` atomic `UPDATE … RETURNING` found no row | Wait a moment, retry; crash-safe — lease expires 195 s; check `sessions.busyUntil` in PG | `chat/route.ts` lease block |
| **403 “This action must be made from your chat workspace.”** on send | Ingress rewrites `Host` without `x-forwarded-host`; origin gate fails both checks | Configure proxy to forward `x-forwarded-host` (Cloudflare/nginx default) or preserve public `Host`; verify `curl -H "Origin: https://host" -H "x-forwarded-host: host"` → 400 not 403 when gated | `origin.ts` + `server.ts assertOrigin` + README troubleshooting |
| **`POST /api/chat` 415/413/400** | Wrong `Content-Type` (415), body >3 MB (413 `The attachment is too large. Use an image under 2 MB.`), invalid JSON (400), empty/oversized prompt (400 `Write/16k`), bad image `data:` URI or `>2 MB` bytes (400 magic-byte) | Check `fetch` `Content-Type: application/json`, body size, `JSON.stringify`, `chatInputSchema` limits | `server.ts readJson` 415/413/400, `validation.ts` |
| **Chat stream error banner (real provider 403/502)** | Provider rejected key (`401/403` → 502 `NVIDIA rejected… Check key`) or busy (`429` → 502 `busy`), or `600k` exceeded / `truncated` | Check key + `moonshotai/kimi-k3` entitlement at `build.nvidia.com`; increase `max_tokens` if `truncated`; server logs `operation:"nvidia.connect", status, conversationId` | `chat/route.ts` `nvidia.connect` error branch |
| **Session reset loses conversations** | Cookie `kimi_session` cleared → new SHA-256 `owner` → orphaned `sessions` + `conversations` (FK cascade keeps old but inaccessible) | Documented session behavior, not data loss; re-login via prior cookie is unsupported — future SSO would make durable `users.id` | `server.ts sessionId/ensureSession`, `schema.ts` FK cascade |
| **E2E: Playwright cannot connect / 404 Scandi Haven** | Port `3000` held by sibling Scandi Haven (`next-server` `v16.3.4` on `3000:5432` vs Kimi `5433:5432`), or `TEST_BASE_URL` wrong | Use `PORT=3004 npm start -- --port 3004` + `TEST_BASE_URL=http://localhost:3004 npx playwright test` (see rebuild runbook `db-init-and-e2e-plan.md`); `ss -tlnp | grep 3000` to identify holder | `playwright.config.ts` `reuseExistingServer` |
| **E2E: missing-key test fails despite no `LIVE_SITE_URL`** | Leaked `NVIDIA_API_KEY` in `.env` violates precondition (`no key`); server returns streaming path not 503 | Run server with `NVIDIA_API_KEY=` empty: `NVIDIA_API_KEY= PORT=3004 npm start …` | `workspace.spec.ts: reports missing provider key` |
| **CI never runs on `main`** (historical) | `.github/workflows/ci.yml` `branches: ain]` corruption | Fix `branches: [main]` — done at `dc1c664` | `git show dc1c664` |
| **Build fails with `DATABASE_URL is required`** (rare) | `drizzle.config.ts` reads `DATABASE_URL` via `dotenv/config` at import, but `next build` itself is DB-independent; if `postcss.config.mjs`/`next.config.ts` imports DB, it would throw | Ensure only `src/db/*` imports `DATABASE_URL`; `next build` should pass even with `.env` present (verified `build 662 ms`) | `drizzle.config.ts: if (!DATABASE_URL.trim()) throw` |
| **WCAG axe violations** | Contrast <4.5:1 on warm white/mint (e.g., error banner) or missing `aria-label` | Raised to `4.5:1+` at pass 2; verify `AxeBuilder` on welcome+dialog+error → `violations: []` | `report` L1 + `workspace.spec.ts` axe tests |
| **SSE gap / missing delta** | Client/server parser mismatch, or `streamEventSchema` zod rejects unknown `type` | Both sides share `lib/sse.ts` — keep them in sync; `providerChunkSchema` `choices[].delta` optional | `chat-workspace.tsx: streamEventSchema` + `route.ts: providerChunkSchema` |

---

## 11. Pre-Ship Checklist

Run **in order** — mirroring `AGENTS.md` Verification order + `ci.yml` gates. Never weaken a gate (no `@ts-ignore`, no rule disable, no test deletion) — fix root causes.

```bash
# 0. Secret hygiene (local)
git ls-files | grep "^\.env$" && echo "FAIL: .env tracked" || echo "ok: .env not tracked"
git check-ignore -v .env   # should print .gitignore:10:.env
git grep -lIE 'nvapi-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}' -- src tests scripts drizzle   # expect 0 hits

# 1. Type safety — route types can never be stale (next typegen before tsc)
npm run typecheck          # next typegen && tsc --noEmit — strict, zero any

# 2. Lint — excludes non-app
npm run lint               # eslint flat + next/core-web-vitals

# 3. Unit — strip-types, no build needed
npm test                   # node --experimental-strip-types --test tests/*.test.mjs → 15/15

# 4. Build — 6 routes
npm run build              # next build Turbopack → ○ / + ○ /_not-found + ƒ /api/chat + ƒ /api/conversations + ƒ /api/conversations/[id] + ƒ /api/health

# 5. Prod audit
npm audit --omit=dev       # must be 0 vulnerabilities (CI gates on this)

# 6. DB — if schema changed
npm run db:generate        # edit src/db/schema.ts first → commit drizzle/*.sql + meta/
npm run db:migrate         # drizzle-kit migrate — [✓] migrations applied
npm run db:seed            # idempotent — {inserted:1} then {inserted:0}

# 7. E2E — prod preview + disposable DB + no NVIDIA_API_KEY (precondition)
# If 3000 busy: use 3004 without key (rebuild runbook)
NVIDIA_API_KEY= PORT=3004 npm start -- --port 3004 &   # bg
sleep 3; curl -s http://localhost:3004/api/health | grep '"ok":true'
TEST_BASE_URL=http://localhost:3004 npx playwright test   # 12 skipped (live), 16 passed (workspace 12 + stream-ui 4) — 14.5s
# or npm run test:e2e (defaults to localhost:3000)
```

**CI guards (mirrors `.github/workflows/ci.yml`):**

- `gates` job: `secret scan → typecheck → lint → test → build → audit` on `ubuntu-latest` Node 22.
- `e2e` job: `postgres:17` service (`5432`), `DATABASE_URL postgres:postgres@127.0.0.1:5432/app_db`, `db:migrate`, `build`, `playwright install chromium --with-deps`, `npx playwright test` (artifact `test-results/` on failure 7 days).
- E2E prerequisites: built app + disposable DB + no `NVIDIA_API_KEY` + `TEST_BASE_URL` override supported.

**Post-deploy verification (smoke):**

```bash
curl -s http://localhost:3004/api/health  # {"ok":true}
curl -s http://localhost:3004/api/conversations   # {conversations:[],configured:false} + set-cookie HttpOnly Strict
curl -sI http://localhost:3004/api/health | grep -E "x-frame-options: DENY|strict-transport-security: max-age=63072000|content-security-policy: frame-ancestors"
# Live: LIVE_SITE_URL=https://kimi-chat.jesspete.shop npx playwright test tests/live-site.spec.ts  # 12/12 when redeployed
```

---

## 12. Lessons Learnt & How to Avoid Them

*Chronological, distilled from 3 passes (8 + 3 commits after audit), `session_1.md`, and the validation plans. Each traces to a fix.*

**Sprint 0 — Foundations (pre-audit):**

1. **History-carried secrets never self-heal** — `docs/ssh-key.txt` removed from tracking but still in `git log`; `.env` added `7afe083` with `nvapi-` still in history at `cb8a05e`. *Avoid:* `git rm --cached` + `.gitignore` **and** immediate rotation at provider console; `git log --all -- .env` + `git ls-tree` before every push; CI secret scan that fails the build (added `dc1c664`).

2. **CI that never runs is worse than no CI** — `branches: ain]` meant push to `main` never gated (`pull_request` still fired, masking it). *Avoid:* `cat -A .github/workflows/ci.yml` for hidden bytes; push a no-op to `main` post-change to prove gates fire; `action/upload-artifact` on failure only.

**Pass 1 → 2 — Security & streaming:**

3. **Provider reasoning must be stripped twice** — `reasoning_content` persisted for multi-turn but leaked to browser if `GET [id]` or `done` forgot to map out. *Avoid:* `item.messages.map(({reasoning:_r,...m})=>m)` + `done: {id,role,content}` only; never `...assistant`; E2E asserts `not.toHaveText(/reasoning/)`.

4. **Limits are server-authoritative, client is hint** — Client mirrored `16k/2MB` but server was the enforcer (zod + magic-byte + 600k + 60/100). *Avoid:* Never trust `maxLength` on `textarea`; enforce in `validation.ts` + `route.ts`; test with `curl` not just UI.

5. **Incremental SSE matters more than it looks** — Buffer-concat failed on `A\r` + `\nB` split and lone-CR hosts. *Avoid:* Share one `SSEParser` server+client; unit tests must `push()` at every boundary (see `core.test.mjs` lone-CR, split-CRLF, exactly-one-space).

**Pass 3 — Live-site truth (session_1 + rebuild):**

6. **Test behind the real ingress** — `Host`-only origin check passed locally but every live `POST /api/chat` 403 behind Cloudflare (rewrites `Host`). *Avoid:* Live `curl Origin` + `git grep x-forwarded-host`; pure `origin.ts` + 7 unit + 1 API regression.

7. **Streaming tests must scope to assistant** — Prompt text in optimistic user bubble satisfied `/live check/`; false “streamed” masked 403. *Avoid:* `locator(".message.assistant").filter({hasText: nonce})`, treat error banner as failure, assert `Copy response` + persistence.

8. **`.gitignore` does not untrack** — `dc1c664` claimed `git rm --cached .env` but `--stat` was only `ci.yml` (no `.env`); at `eb654aa` `git ls-tree` still tracked + `git grep nvapi-` hit `.env`. *Avoid:* Verify `git ls-files | grep ^.env$` exit 1 + `git check-ignore -v .env` after every “untrack” commit; late `272d7ff` actually removed it; addendum `6be7596`.

9. **Port is a contract** — `3000` held by Scandi Haven (`next-server v1` on `3000:5432` vs Kimi `5433:5432`); `reuseExistingServer: true` served stale build; `npm test` missing-key failed when key present. *Avoid:* `ss -tlnp | grep 3000` before start; use `PORT=3004 + TEST_BASE_URL=http://localhost:3004` when 3000 busy; run no-key server with `NVIDIA_API_KEY=` for E2E.

10. **Docs drift is a bug** — `README/AGENTS` carried duplicated Docker evidence/`bg_start` logs and contradictory instructions; `AGENTS` map missed `origin.ts` + `navigation-frame.tsx` before `12409ae`/`eb654aa`. *Avoid:* PAD as single source; `find src -type f | diff` after doc edits; `tsconfig` excludes `skills/sample-build/docs` but that does not excuse stale `README`.

11. **Not all sample-build is an upgrade** — `workspace-polish.css` contradicted `globals.css` (would stack); adopting it would have degraded design. *Avoid:* Adopt only `NavigationFrame` + incremental `SSEParser` (standalone value); rationale logged as report I4.

**Rebuild (2026-09-10 13:34):**

12. **DB rebuild must be runbooked** — `docker compose down -v` deletes `chat_data`; re-`up -d` needs `[✓] migrations applied` + `{inserted:1→0}` before `build`+`start` + E2E, else `/api/health` 500. *Avoid:* `db-init-and-e2e-plan.md` 6-phase checklist with `curl /api/health → {"ok":true}` gate before E2E.

---

## 13. Pitfalls to Avoid

**Architecture:**

- **Don’t put DB access in middleware/edge** — `origin.ts` is pure (no `pg`/`next/headers`); keep `src/lib/origin.ts` importable by `node:test`.
- **Don’t add a second SSE parser** — `lib/sse.ts` is shared server+client; divergence = streaming bug.
- **Don’t store raw `kimi_session` in DB** — only `SHA-256(token)` as `sessions.id` + `conversations.owner`.
- **Don’t add `tailwind.config.js`** — Tailwind v4 is CSS-first (`@import "tailwindcss"` in `globals.css`); tokens live in `:root`.
- **Don’t create feature folders before you have two features** — `src/components` is one client component by design; split only when `chat-workspace.tsx` needs extraction.

**TypeScript:**

- **Don’t use `any`** — `unknown` + narrowing; `noExplicitAny` would bite `providerChunkSchema` `error: z.unknown()`.
- **Don’t add explicit return types unless inference fails** — as per `CLAUDE.md`.
- **Don’t use `as any` to silence `providerChunkSchema`** — zod already types `reasoning_content?`.
- **Don’t import `drizzle-orm` tables with `@/` in scripts** — `scripts/*.mjs` need explicit `.ts` extensions + injected `{db,tables}` (type-stripping requires extensions).

**Testing:**

- **Don’t delete/skip a failing test to make CI pass** — fix root cause (gates must stay strict).
- **Don’t run E2E with a real `NVIDIA_API_KEY`** — the missing-key test expects 503 curated; run `NVIDIA_API_KEY=` for that server.
- **Don’t let `reuseExistingServer` serve stale build** — `npm run build` before `npx playwright test` when `reuseExistingServer: true`.

**Design:**

- **Don’t hardcode hex outside `globals.css`** — reuse `var(--mint)` etc.; chip colors are tokens.
- **Don’t add purple gradients** — mint/green only.
- **Don’t rebuild `Dialog` from scratch** — use Radix (`Focus containment`, `Escape`, `onCloseAutoFocus`).

**Security:**

- **Don’t log `message.content`/`cookie`/`key`** — `console.error(JSON.stringify({operation, ids, errorType}))` only.
- **Don’t leak `reasoning_content`** — strip on `GET [id]` + `done`; keep in DB for multi-turn.
- **Don’t trust `Host` alone behind ingress** — forward `x-forwarded-host` or preserve public `Host`.
- **Don’t commit `.env`** — `.gitignore` + untracked + rotation; verify with `git ls-files`.

**Performance:**

- **Don’t concatenate SSE buffers then `split("\n\n")`** — incremental `SSEParser` only.
- **Don’t store 8 MB `messages` without the 8 MB guard** — `60 messages` OR `8_000_000 JSON` → 400.
- **Don’t fetch model Markdown images** — `img` is replaced `[Image: alt]`.

---

## 14. Best Practices

**Code organization:**

- Early returns, composition over inheritance, self-documenting names.
- One responsibility per module: `origin` (pure gate) vs `server` (cookie+body+errors) vs `validation` (zod) vs `sse` (streaming) vs `types` (contracts).
- `src/app/api/*` route handlers are thin: `assertOrigin → requireSession → readJson → zod → magic-byte → lease → upsert → NIM SSE → persist final → stream`.

**TypeScript/React/Next:**

- `interface` for shapes, `type` for unions (`role: "user"|"assistant"`, `reasoningEffort: "low"|"high"|"max"`).
- `strict` + `isolatedModules`; avoid explicit return types.
- React 19: handle loading/error/empty/success explicitly; disable controls while `busy`; keep derived state out of `useState`.
- Next 16: `export const runtime="nodejs"` where streaming, `maxDuration=180`; `next typegen` before `tsc`.

**Styling:**

- Tailwind v4 CSS-first `@theme` — reuse `--mint` palette (`#e8f0e2`) + `--green #306345` + `--canvas`, not hard-coded hex.
- Custom styling only to achieve the mint editorial vision; underlying primitive from Radix when it exists.
- Micro-interactions + perfect spacing + invisible UX; whitespace as structure.

**Testing (TDD mandatory):**

- `red → green → refactor → commit` per feature; bug fix = failing regression test first.
- Factory pattern for test data: `getMockX(overrides)` style where fixtures inserted via `owner` hash.
- `npm test` (node:test strip-types) + `npx playwright test` (line reporter, workers 1).

**Database:**

- Parameterized Drizzle exclusively; `searchPattern` wildcard-escapes; `onDelete cascade` for `sessions`→`conversations`; `pruneIdleSessions`/`pruneStaleConversations` pure with injected `{db,tables}`.
- Migrations: `db:generate` → commit `drizzle/*.sql` → `db:migrate` (journal-driven, not `push` in prod).

**Security:**

- Zod at every boundary (`validation.ts` single home); `readJson` 3 MB bounded; `ApiError` + `errorResponse` single funnel; curate copy, never generic, never provider internals.
- `kimi_session` `httpOnly Strict` `Max-Age 30d`, `Secure` via `https` or `x-forwarded-proto`.

**Design:**

- Anti-generic enforcement: reject `Inter/Roboto` safety, purple gradients, predictable grids — every pixel serves a purpose; bespoke typography + meticulous hierarchy; whitespace as structural element.

---

## 15. Coding Patterns

### Pattern 1: API Route (list/search) — `GET /api/conversations`

```typescript
// Location: src/app/api/conversations/route.ts
// Purpose: Owner-scoped list with title+JSONB content search (?q=), owner-filtered, wildcard-escaped.

export const dynamic = "force-dynamic";
function searchPattern(term: string){ return `%${term.replace(/[\\%_]/g,"\\$&")}%`; }

export async function GET(req: NextRequest){
  try{
    const { owner, token } = await ensureSession(req); // generates if missing
    const term = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0,200);
    const condition = term
      ? and(eq(conversations.owner, owner), or(
          ilike(conversations.title, searchPattern(term)),
          sql`exists (select 1 from jsonb_array_elements(${conversations.messages}) as m where m->>'content' ilike ${searchPattern(term)})`
        ))
      : eq(conversations.owner, owner);
    const items = await db.select({id: conversations.id, title: conversations.title, updatedAt: conversations.updatedAt})
      .from(conversations).where(condition).orderBy(desc(conversations.updatedAt)).limit(100);
    return setSession(NextResponse.json({conversations: items, configured: Boolean(process.env.NVIDIA_API_KEY)}), token, req);
  }catch(e){ return errorResponse(e, "conversations.list"); }
}
```

### Pattern 2: Atomic Lease + Duplicate-Retry Guard — `POST /api/chat`

```typescript
// Location: src/app/api/chat/route.ts (excerpt)
// Purpose: One generation per session (crash-safe), duplicate-retry guard, persist final only.

const now = new Date(); const proposedLease = new Date(now.getTime()+195_000);
const [claimed] = await db.update(sessions)
  .set({busyUntil: proposedLease, lastRequest: now})
  .where(and(eq(sessions.id,owner), lt(sessions.busyUntil,now), lt(sessions.lastRequest,new Date(now.getTime()-3000))))
  .returning({id:sessions.id});
if(!claimed) throw new ApiError(429,"A response is already running, or messages were sent too quickly…");
lease = proposedLease;

const last = conversation.messages.at(-1);
const messages = last?.role==="user" && last.content===input.content && last.image===input.image
  ? conversation.messages : [...conversation.messages, userMessage];
// ... provider SSE via SSEParser, providerChunkSchema, 600k cap ...
if(!completed || !assistant.content) throw new ApiError(502,"The response ended before an answer was completed…");
if(truncated) assistant.content += "\n\n*Response reached the output limit. Ask me to continue.*";
await db.update(conversations).set({messages:[...saved.messages, assistant], updatedAt:new Date()}).where(eq(conversations.id,saved.id));
send({type:"done", message:{id:assistant.id,role:assistant.role,content:assistant.content}});
// finally: await release(); if(!aborter.signal.aborted) controller.close();
```

### Pattern 3: Pure Origin Gate — `lib/origin.ts`

```typescript
// Location: src/lib/origin.ts
// Purpose: Proxy-aware same-origin (Host OR first x-forwarded-host), unit-testable (no Next/DB).

export function isSameOriginRequest(origin: string|null, host: string|null, forwardedHost: string|null, secFetchSite: string|null): boolean{
  if(secFetchSite==="cross-site") return false;
  if(!origin || !host || !URL.canParse(origin)) return false;
  const url = new URL(origin);
  if(!["http:","https:"].includes(url.protocol)) return false;
  const forwarded = forwardedHost?.split(",")[0]?.trim();
  return url.host===host || (Boolean(forwarded) && url.host===forwarded);
}
```

### Pattern 4: Bounded Body + Single Error Funnel — `lib/server.ts`

```typescript
// Location: src/lib/server.ts
// Purpose: 3 MB stream-bound readJson + ApiError(status,message) + errorResponse(operation).

export async function readJson(req: NextRequest, maxBytes=3_000_000): Promise<unknown>{
  if(!req.headers.get("content-type")?.includes("application/json")) throw new ApiError(415,"Send a JSON request.");
  const reader = req.body!.getReader(); let size=0; const chunks:Uint8Array[]=[];
  while(true){
    const {done,value}= await reader.read(); if(done) break;
    size+=value.byteLength; if(size>maxBytes){ await reader.cancel(); throw new ApiError(413,"The attachment is too large. Use an image under 2 MB."); }
    chunks.push(value);
  }
  try{ return JSON.parse(Buffer.concat(chunks).toString("utf8")); }catch{ throw new ApiError(400,"The request contains invalid JSON."); }
}
export class ApiError extends Error{ constructor(public status:number, message:string){ super(message); } }
export function errorResponse(error: unknown, operation: string){
  if(error instanceof ApiError) return NextResponse.json({error:error.message},{status:error.status});
  const requestId = crypto.randomUUID();
  console.error(JSON.stringify({operation,requestId,errorType: error instanceof Error?error.name:"UnknownError"}));
  return NextResponse.json({error:"The workspace could not complete this action. Please try again.",requestId},{status:500});
}
```

### Pattern 5: Incremental SSE — `lib/sse.ts` (shared)

```typescript
// Location: src/lib/sse.ts  + consumed by route.ts (server) and chat-workspace.tsx (client)
// Purpose: LF/CRLF/CR + split-CRLF + exactly-one-space + incremental 1M.

const MAX = 1_000_000;
push(chunk:string):string[]{
  const events:string[]=[]; let start=0;
  for(let i=0;i<chunk.length;i++){
    const ch=chunk[i];
    if(this.skipLF){ this.skipLF=false; if(ch==="\n"){ start=i+1; continue; } }
    if(ch!=="\r" && ch!=="\n") continue;
    this.append(chunk.slice(start,i)); this.consumeLine(events); // data: slice + \n-join + limit
    this.skipLF = ch==="\r"; start=i+1;
  }
  this.append(chunk.slice(start)); return events;
}
finish():string[]{ return this.push("\n\n"); }
// consumeLine: line==="" → push data.join("\n") as event; !data: return; value = line.slice(line[5]===" "?6:5)
```

### Pattern 6: Client Boundary Validation — `chat-workspace.tsx`

```typescript
// Location: src/components/chat-workspace.tsx
// Purpose: Never trust server/HTML — zod every response/stream chunk; degraded HTML shows curated copy.

async function apiJson(res: Response): Promise<unknown>{
  let data:unknown; try{ data=await res.json(); }catch{ data=undefined; }
  if(!res.ok){ const e=z.object({error:z.string()}).safeParse(data); throw new Error(e.success?e.data.error:"The request failed. Please try again."); }
  return data;
}
function parseOrReload<T extends z.ZodTypeAny>(schema:T, data:unknown): z.infer<T>{
  const r=schema.safeParse(data); if(!r.success) throw new Error("Could not load your workspace. Please reload.");
  return r.data;
}
const streamEventSchema = z.discriminatedUnion("type",[
  z.object({type:z.literal("meta"), conversation:summarySchema}),
  z.object({type:z.literal("thinking")}),
  z.object({type:z.literal("delta"), content:z.string()}),
  z.object({type:z.literal("done"), message:messageSchema}),
  z.object({type:z.literal("error"), message:z.string()}),
]);
```

### Pattern 7: Idempotent Seed — `db/seed.ts`

```typescript
// Location: src/db/seed.ts + scripts/seed.mjs
// Purpose: Injected {db,tables}, no @/ aliases, no relative runtime imports beyond drizzle-orm, safe to re-run.

export async function seed(db: Db, tables:{sessions: SessionsTable, conversations: ConversationsTable}){
  const id = "seed-owner"; // deterministic for dev
  await db.insert(tables.sessions).values({id}).onConflictDoNothing();
  const {rowCount} = await db.insert(tables.conversations).values({owner:id,title:"Welcome",messages:[]}).onConflictDoNothing();
  return {inserted: rowCount ?? 0};
}
// scripts/seed.mjs: const {prune…}=await import("../src/lib/retention.ts"); const {db,pool}=await import("../src/db/index.ts"); await seed(db,{sessions,conversations}); console.log(JSON.stringify({operation:"db.seed",inserted}));
```

---

## 16. Coding Anti-Patterns

| Don’t | Do instead | Why |
|-------|------------|-----|
| `as any` to silence zod/provider types | `zod` + `z.unknown()` + `providerChunkSchema.parse(JSON.parse(event))` | `as any` defeats strict; `dc1c664` hygiene requires real safety |
| Track `.env` (`git add .env`) | `git rm --cached .env` + `.gitignore:10:.env` + rotate at provider console | History retains it even after untrack |
| `branches: ain]` in `ci.yml` | `branches: [main]` | CI silently skips `main` until fixed |
| Buffer-concat `split("\n\n")` for SSE | `SSEParser.push(chunk)` incremental | Lone-CR / split-CRLF / size limits break |
| Split-CRLF mishandle (`data: A\r` + `\ndata: B`) | `skipLF` flag (see Pattern 5) | Otherwise blank line emitted |
| CSS-only scrim without focus trap | `NavigationFrame` Radix `Dialog.Root asChild` | `aria-hidden` hides backdrop; in-drawer `.sidebar-close` needed |
| `readJson` without bound | `readJson(req, 3_000_000)` with `reader.cancel()` | DoS via 600k+ response or 3 MB+ body |
| Store `reasoning_content` to browser | `map(({reasoning:_r,...m})=>m)` + `done: {content}` only | Persist for multi-turn, strip from every `GET [id]`/stream |
| `NEXT_PUBLIC_NVIDIA_API_KEY` | `process.env.NVIDIA_API_KEY` server-only, 503 when missing | `rg NEXT_PUBLIC` must be empty in `src/` |
| `Host`-only origin check behind ingress | `isSameOriginRequest` with `x-forwarded-host` first value | Cloudflare rewrites `Host` → 403 every browser write |
| `any`/`@ts-ignore`/delete test to pass gate | Fix root cause (gate order `typecheck→lint→test→build` never weakened) | `route` types via `next typegen` + `tsc --noEmit` |
| `@/` alias in `scripts/*.mjs` | Explicit `.ts` + injected `{db,tables}` + `dotenv/config` | Node type-stripping requires extensions |
| `amber-400` hard-coded chip | `var(--mint)`/`--green` tokens in `globals.css` | Brand drift; tests enforce mint |
| `img` as `dangerouslySetInnerHTML` | `react-markdown` + `img → [Image: alt]` | Remote image fetch DoS/injection |
| `import.meta.glob` for conversations | `GET /api/conversations` DB JSONB | App Router + DB is the source |
| `default export` for lib modules | Named `export function pruneIdleSessions` | Named helps tree-shake + grep |

---

## 17. Responsive Breakpoint Reference

Tailwind defaults (no custom `tailwind.config.js` — v4 CSS-first).

| Breakpoint | Min | Usage |
|------------|-----|-------|
| (base) | — | Default: starter 4 cols (918 px max), `welcome h1 52px`, `sidebar 264px`, `composer-area 918px`, `messages 850px` |
| `≤1150px` | `@media (max-width:1150px)` | `sidebar 237px`, `topbar 23px padding`, `welcome`/`composer-area` `28px` sides, `starter-card 14×11`, `welcome h1 44px`, `image-capable` hidden, `nav-search kbd 8px` |
| `≤900px` | `@media (max-width:900px)` | `starter-grid repeat(2,1fr) max 500px`, `welcome h1 37px`, `starter-card 12×13`, `category-icon 28px`, `prompt-starters last hidden`, `topbar 19px 65px` |
| `≥1500px` | `@media (min-width:1500px)` | `sidebar 282px` (padding 24), `welcome/composer-area 1020px`, `starter-card 20px`, `welcome h1 57px`, `composer textarea 13px 59px min` |

**Mobile drawer:** `390×844` viewport (`workspace.spec.ts: mobile navigation and composer fit viewport`) — no `scrollWidth > innerWidth`, `mobile-scrim` + `Dialog` portal.

**Testing:** Playwright `viewport {390,844}`, `1440×1000`, `reducedMotion: "reduce"`; screenshot `fullPage` for desktop/mobile.

---

## 18. Z-Index Layer Map

| Layer | Z | Element / Location | Purpose |
|-------|---|--------------------|---------|
| Base | `0` | App shell, sidebar, main-panel | Layout |
| Canvas | `1` | `welcome-emblem` glow `radial-gradient` | Decoration, `z-index -1` on `.emblem-glow` |
| Sidebar | `30` | `aside.sidebar z-index 30` | Above main; `position relative` |
| Scrim | `29` | `.mobile-scrim z-index 29` (Overlay `asChild` button) | Below dialog content, above base |
| Dialog | `60–61` | `.dialog-overlay z 60`, `.dialog-content z 61` | Radix portal — focus trapped |
| Toast | `80` | `.toast z 80` | Above dialogs |
| Portal (Radix) | `60+` | `NavigationFrame` via `Dialog.Portal` | Escapes stacking context |

**Rule:** Radix `Dialog` portals at `60+`, scrims at `29`, sidebar at `30` — never invent ad-hoc `z-50` chips; use tokens + these 5 layers.

---

## 19. Color Reference (Complete)

**Semantic tokens (`--` in `src/app/globals.css :root`) — every hex verified at `f888508`:**

| Token | Hex | Tailwind/RGB | Usage | Contrast |
|-------|-----|--------------|-------|----------|
| `--canvas` | `#fcfdfb` | `bg canvas` | App background | — |
| `--sidebar` | `#f5f7f3` | `bg sidebar` | Sidebar | — |
| `--surface` | `#fff` | white | Composer/dialog | — |
| `--ink` | `#26362f` | `ink` | Primary text on canvas | >7:1 AAA |
| `--muted` | `#5f6c55` | `muted` | Secondary on warm white/mint | ≥4.5:1 AA (raised, report L1) |
| `--subtle` | `#626e65` | `subtle` | Tertiary | AA on canvas |
| `--line` | `#e5e9e2` | `line` | Borders | — |
| `--green` | `#306345` | `green` | Links, brand, `kimi.` dot `#719570` variant | AAA on mint |
| `--green-dark` | `#244d36` | `green-dark` | Hover `#405f2a` | — |
| `--mint` | `#e8f0e2` | `mint` | Wash (chips, highlights) | Mint |
| `--focus` | `#60926f` | `focus` | `outline 2px solid`, `composer focus 2px solid #b4c5a6` | Focus |
| `--danger` | `#a44539` | `danger` | Destructive `danger-button #a65647→#8b3d32` | — |
| `--radius` | `14px` | radius | Corners base | — |

**Category washes (beyond tokens):**

| Name | BG | FG | Used |
|------|----|----|------|
| `peach` | `#faede4` | `#bd8d71` | write (PenLine) |
| `lavender` | `#f0edf9` | `#9b8cb2` | code (Code2) |
| `yellow` | `#f7f1dd` | `#baa05d` | idea (Lightbulb) |
| `mint wash` | `#eaf2e5` | `#82996a` | image (ImageIcon) |

**Forbidden:** `purple-gradient`, `amber-400` hard-coded chips, any hex outside tokens — enforced by “reuse `var(--mint)`” rule + design review (see §1 anti-generic).

**Opacity variants:** `brand-dot #719570`, `emblem-star #9caa87`, `promo-decoration #d9e3ce 0.65`, `dialog-overlay #18241c55 + blur 5px`.

---

## 20. The Complete TypeScript Interface Reference

*Verifiable by `tsc --noEmit` at `cb8a05e`. Paths are authoritative — `src/lib/types.ts` is the domain contract; `validation.ts` is the boundary zod; `db/schema.ts` is the persistence shape.*

```typescript
// src/lib/types.ts — Domain contracts (SINGLE SOURCE)
interface ChatMessage {
  id: string;                          // crypto.randomUUID()
  role: "user" | "assistant";
  content: string;                     // ≤16k trimmed
  image?: string;                      // data:image/(png|jpeg|webp);base64,… ≤2.8M chars, magic-byte + ≤2MB bytes
  reasoning?: string;                  // assistant only — reasoning_content, persisted for multi-turn, stripped from browser
}
interface ConversationSummary { id: string; title: string; updatedAt: string /* ISO */ }
interface ChatSettings {
  temperature: number;   // 0–2, default 1
  maxTokens: number;     // 256–16384, default 16384
  reasoningEffort: "low" | "high" | "max"; // default max
}
const defaultSettings: ChatSettings = { temperature: 1, maxTokens: 16384, reasoningEffort: "max" };

// src/lib/validation.ts — Boundary schemas (ZOD 4.6.1)
const imageSchema: z.ZodString = z.string().max(2_800_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/, "Use a PNG, JPEG, or WebP image under 2 MB.");
const chatInputSchema = z.object({
  conversationId: z.uuid().optional(),
  content: z.string().trim().min(1,"Write a message first.").max(16000,"Messages can contain up to 16,000 characters."),
  image: imageSchema.optional(),
  settings: z.object({
    temperature: z.number().min(0).max(2),
    maxTokens: z.number().int().min(256).max(16384),
    reasoningEffort: z.enum(["low","high","max"]),
  }).strict(),
}).strict();
const titleSchema = z.object({ title: z.string().trim().min(1).max(100) }).strict();
const idSchema = z.uuid();
const providerChunkSchema = z.object({
  choices: z.array(z.object({
    delta: z.object({ content: z.string().nullish(), reasoning_content: z.string().nullish() }).optional(),
    finish_reason: z.string().nullish(),
  })).optional(),
  error: z.unknown().optional(),
});

// src/db/schema.ts — Persistence (Drizzle)
const sessions = pgTable("chat_sessions", {
  id: text("id").primaryKey(), // SHA-256 hex
  createdAt: timestamp("created_at", {withTimezone:true}).defaultNow().notNull(),
  lastRequest: timestamp("last_request", {withTimezone:true}).notNull().default(new Date(0)),
  busyUntil: timestamp("busy_until", {withTimezone:true}).notNull().default(new Date(0)),
});
const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  owner: text("owner").notNull().references(()=>sessions.id,{onDelete:"cascade"}),
  title: text("title").notNull(),
  messages: jsonb("messages").$type<ChatMessage[]>().notNull().default([]),
  createdAt: timestamp("created_at",{withTimezone:true}).defaultNow().notNull(),
  updatedAt: timestamp("updated_at",{withTimezone:true}).defaultNow().notNull(),
}, (t)=> [ index("conversations_owner_updated_idx").on(t.owner,t.updatedAt) ]);

// API contracts (inferred from handlers + zod safeParse)
type ApiErrorShape = { error: string; requestId?: string }; // errorResponse: ApiError→{error,status}, unknown→{error:"The workspace…",requestId,500}
type ConversationsListResponse = { conversations: ConversationSummary[]; configured: boolean };
type ConversationResponse = { conversation: ConversationSummary & { messages: Omit<ChatMessage,"reasoning">[] } };
type RenameResponse = { id: string; title: string };
type DeleteResponse = { ok: true };
type HealthResponse = { ok: true } | { ok: false };
type PruneResponse = { operation:"retention.prune"; idleDays: number; conversationDays: number|null; sessionsDeleted: number; conversationsDeleted: number };
type SeedResponse = { operation:"db.seed"; inserted: number };
```

**SSE contract (provider → route → browser):**

```typescript
// Client guard (chat-workspace.tsx)
type StreamEvent =
  | { type:"meta"; conversation: ConversationSummary }
  | { type:"thinking" }
  | { type:"delta"; content: string }
  | { type:"done"; message: Omit<ChatMessage,"reasoning"|"image"> & {image?:string} } // reasoning stripped, image only if persisted
  | { type:"error"; message: string }; // curated copy, never raw

// Provider chunk (validation.ts): stream chunks are JSON lines "data: {…}\n\n", "[DONE]" sentinel terminates
```

**DB entity — full row shapes:**

```typescript
type SessionRow = { id: string; createdAt: Date; lastRequest: Date; busyUntil: Date };
type ConversationRow = { id: string; owner: string; title: string; messages: ChatMessage[]; createdAt: Date; updatedAt: Date };
```

---

## Appendices

### Appendix A: ADRs (Table)

| ADR | Decision | Key Rationale |
|-----|----------|---------------|
| 001 | Next 16 App Router + `runtime nodejs` `maxDuration 180` | Route handlers + SSE + `next typegen` vs Vite SPA separate API |
| 002 | Drizzle+pg over Prisma | Explicit SQL (`jsonb_array_elements` ILIKE, `FOR UPDATE`), journal SQL migrations, controllable Pool |
| 003 | SHA-256 session cookie over JWT/Auth.js | Workspace, not identity; minimal, HttpOnly Strict, fixation-free; SSO is future hardening |
| 004 | Pure proxy-aware origin gate (`x-forwarded-host`) | Cloudflare rewrites `Host` → 403 every write; pure testable gate, 7 unit + API regression, security envelope unchanged |
| 005 | Incremental SSEParser (shared) | LF/CRLF/CR + split-CRLF + one-space + incremental 1M — chunk-boundary safe |
| 006 | Radix Dialog drawer | Focus trap + Escape + focus restore + in-drawer close (Portal `aria-hidden` needs it) |
| 007 | Tailwind CSS-first `@theme` (no `tailwind.config.js`) | Tokens co-located in `globals.css`, reuse `var(--mint)` etc. |

### Appendix B: Pipeline / Workflow Costs

| Operation | Cost / Time | Where enforced |
|-----------|-------------|----------------|
| `npm run typecheck` | ~3s (typegen + tsc) | Pre-commit + CI `gates` |
| `npm test` | ~300 ms (15 tests strip-types) | CI `gates` |
| `npm run build` | 0.6–3s Turbopack, 6 routes, 4 pages | CI `gates` |
| `npx playwright test` | ~14.5s (16 passed, 12 skipped) workers 1 | CI `e2e` (postgres:17 service) |
| `POST /api/chat` | 503 when no key (8 ms), else provider latency + 175 s timeout, 195 s lease, 600k cap | `route.ts` + `pool` |
| `GET /api/conversations?q=` | `ilike` on `title` + `jsonb_array_elements→content` + `limit 100` + index `owner,updatedAt` | `route.ts` + `schema.ts` |
| `pruneIdleSessions(30)` | Deletes `sessions` where `lastRequest < cutoff` cascade → conversations | `retention.ts` pure; `prune` CLI weekly |
| Docker PG `healthy` | 10s start_period + 5s interval 10 retries | `docker-compose.yml` healthcheck |

### Appendix C: Audit History

| Date | Pass | Scope | Gate result | Key fixes | Head |
|------|------|-------|-------------|-----------|------|
| 2026-09-10 | Pass 1-2 | `src/ tests/ configs CI live` | H2 DB unreachable → fixed by operator; L1 WCAG error-state contrast raised | Error-state WCAG + missing-key draft preservation | `6e1d0df` |
| 2026-09-10 | Pass 3 | Tiered (gates, OWASP, secret, deps, 12-cat, unit+E2E+live, contract, expert) | Typecheck✓ lint 0 test 15/15 build 6 health `{"ok":true}` → 11/12 live (streaming 403) | C2 `.env` tracked, H1 origin 403, H2 `branches: ain]`, M1 live false streamed, E1 origin gate, E2 SSE parser, E3 Radix drawer, E5 live test harden, E6 CI hygiene | `dc1c664→eb654aa` (7 commits) |
| 2026-09-10 | Post-3 late | `eb654aa→cb8a05e` | `git ls-tree` revealed `dc1c664` never untracked `.env` (`--stat` had no `.env`); `git grep nvapi-` hit `.env` | `272d7ff` actually `git rm --cached .env`, addendum `6be7596`, plans `74a57ad`/`9db90b2`, rebuild `f888508` (3004 16 passed) | `f888508→cb8a05e` (4 commits) |

### Appendix D: Post-Deploy Live-Site Validation

**Target:** `https://kimi-chat.jesspete.shop` (Cloudflare TLS ingress — public Host forwarded as `x-forwarded-host`).

**What `agent-browser`/`playwright` catches that CI cannot:**

- `Host` rewrite proving live 403 (pre-fix) — `curl -H Origin https://host` + `x-forwarded-proto: https` proof via `Secure` cookie.
- Prompt-starter `Fill prompt` + composer `16k` bound + settings `temperature`/`reasoningEffort` interaction.
- WCAG `axe` on real rendered welcome/dialog/error (L1).
- Session isolation via two `browser.newContext()` cookies + SHA-256 owner.
- `?q=xylophone` content-only search vs title-only local filter.

**Smoke (live or local 3004):**

```bash
curl -s http://localhost:3004/api/health                     # {"ok":true}
curl -s http://localhost:3004/api/conversations              # {conversations:[],configured:false} + kimi_session
TEST_BASE_URL=http://localhost:3004 npx playwright test       # 12 skipped, 16 passed
LIVE_SITE_URL=https://kimi-chat.jesspete.shop npx playwright test tests/live-site.spec.ts  # 12/12 when redeployed
```

**Known open after pass 3:** Rotate SSH (`docs/ssh-key.txt` history) + NVIDIA (`nvapi-…` history) — keys read as dead (`403 Authorization failed` direct probe) but history retains; redeploy prod for origin fix; weekly `prune` cron.

---

## Quick Reference Card

| Need | Where | Command / Path |
|------|-------|----------------|
| Install | Root | `npm ci` (Node ≥22, `package-lock.json 368 KB`) |
| DB up | Root | `sudo docker compose up -d` → `5433:5432` healthy + `00-create-extensions.sql` |
| Migrate | Root | `npm run db:migrate` → `[✓] migrations applied` |
| Seed | Root | `npm run db:seed` → `{inserted:1}`→`{inserted:0}` |
| Dev | Root | `npm run dev` → `http://localhost:3000` (or `PORT=3004` when busy) |
| Build | Root | `npm run build` → `Compiled successfully in 662ms` 6 routes |
| Prod | Root | `npm start` / `PORT=3004 npm start -- --port 3004` |
| Typecheck | Root | `npm run typecheck` → `next typegen && tsc --noEmit` |
| Lint | Root | `npm run lint` → flat `next/core-web-vitals` |
| Unit | Root | `npm test` → `node --experimental-strip-types --test tests/*.test.mjs` 15/15 |
| E2E | Root | `TEST_BASE_URL=http://localhost:3004 npx playwright test` → 12 skipped 16 passed |
| Health | Browser | `curl -s http://localhost:3004/api/health` → `{"ok":true}` |
| Prune | Root | `npm run prune -- --idle-days 30 [--conversation-days 90]` |
| Tokens | `src/app/globals.css` | `:root {--canvas #fcfdfb, --mint #e8f0e2, --green #306345, --focus #60926f …}` |
| Schema | `src/db/schema.ts` | `chat_sessions (id text PK) + conversations (uuid PK, owner FK cascade, jsonb messages, index owner_updated)` |
| Origin gate | `src/lib/origin.ts` | `isSameOriginRequest(origin,host,forwardedHost,secFetchSite)` — pure |
| SSE | `src/lib/sse.ts` | `SSEParser` — LF/CRLF/CR, split-CRLF, exactly-one-space, shared |
| Validation | `src/lib/validation.ts` | `chatInputSchema 16k`, `imageSchema 2.8M`, `titleSchema 1-100` |
| Session | `src/lib/server.ts` | `kimi_session` 64-hex → SHA-256, `assertOrigin`, `readJson 3MB`, `errorResponse` curated |
| Workspace | `src/components/chat-workspace.tsx` | 1572 lines — the entire UI; search `⌘K` 250 ms → `?q=` |
| Drawer | `src/components/navigation-frame.tsx` | 46 lines — Radix `Dialog asChild` |
| CI | `.github/workflows/ci.yml` | `gates` secret scan → typecheck → lint → test → build → audit + `e2e` postgres:17 service |
| PAD | Root | `Project_Architecture_Document.md` v1.0 — blueprint (this SKILL’s source) |
| Audits | `docs/CODE_REVIEW_REPORT.md` | Pass-3 ledger + late addendum |

**How to use this SKILL:** Read §1→§3 to bootstrap; §4→§5 to extend UI without generic drift; §9→§10 to debug the 14 known bugs; §15 to copy-paste a route/lease/SSE/seeding pattern; §11 before every ship.

---

*End of new-chat SKILL v1.0 — distilled `cb8a05e` (f888508 verified) via six-phase process (ANALYZE→PLAN→VALIDATE→IMPLEMENT→VERIFY→DELIVER); mirrors PAD v1.0 and live `db-init-and-e2e-plan.md` evidence. Keep it definitive — every line traces to a file at `cb8a05e`.*

