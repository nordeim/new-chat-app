---
IMPORTANT: File is read fresh for every conversation. Be brief and practical.
---

# Kimi Workspace (new-chat-app)

## Core Identity & Purpose

A production-grade chat workspace: streamed NVIDIA NIM responses (`moonshotai/kimi-k3` via the OpenAI-compatible endpoint), saved conversations with search/rename/delete/export, image-aware composer, and a calm mint-accented UI. Conversations are isolated by a secure browser-session cookie; only a SHA-256 digest of the cookie token reaches the database. Maintained as a clean Next.js/PostgreSQL starter suitable for enterprise adoption work.

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
- **Session isolation** — every conversation query filters by `owner`; writes require a same-origin `Origin` header.

## Implementation Standards

### General Coding Practices

- Early returns; composition over inheritance; self-documenting names.
- TDD for new logic: failing test first, then minimal implementation.
- No `any` — use `unknown` plus narrowing. No `@ts-ignore`. No disabled rules/tests.
- Validate all external input with zod at the boundary (`src/lib/validation.ts` is the single home for schemas).
- One responsibility per module; parse provider data as typed structures, dispatch on explicit `type` fields.

### Language & Framework Guidelines

**TypeScript (strict mode)**
- `tsconfig` excludes `skills/`, `sample-build/`, `docs/` — reference material, not app code. Do not remove the excludes.
- Avoid explicit return types unless inference fails.

**React 19 (client component)**
- The workspace is a single client component (`src/components/chat-workspace.tsx`): handle loading/error/empty/success states explicitly; disable controls during async work; keep derived state out of `useState`.
- Effects must not call `setState` synchronously (lint rule `react-hooks/set-state-in-effect` is an error here).

**Next.js 16 (App Router)**
- Route handlers under `src/app/api/*` with `export const runtime = "nodejs"` where streaming is used (`maxDuration = 180` on `/api/chat`).
- `npm run typecheck` runs `next typegen` before `tsc --noEmit`; use it after every route change.
- Security headers and CSP in `next.config.ts`; keep them intact.

**Tailwind v4 (CSS-first)**
- No `tailwind.config.js`; tokens and component styles live in `src/app/globals.css` (`--mint` palette). Reuse tokens; do not hardcode colors.

## Development Workflow

### Environment Setup

```bash
npm ci                                # Node.js >= 22
cp .env.example .env                  # set DATABASE_URL (NVIDIA_API_KEY optional for UI tests)
npx drizzle-kit push                  # apply schema to the dev database
npm run dev                           # http://localhost:3000
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

## Testing Strategy

### Test Pyramid

- **Unit** (`tests/core.test.mjs`): zod schemas, SSE parser edge cases — fast, no services.
- **API/integration** (`tests/workspace.spec.ts`): session isolation, ownership, origin enforcement, cookie flags — Playwright request context + Drizzle fixtures.
- **E2E/UI** (`tests/workspace.spec.ts`, `tests/stream-ui.spec.ts`): user journeys, WCAG AA via axe, streamed-answer rendering through a transport fixture (no live provider needed).

### Test Commands

```bash
npm test                       # unit
npm run test:e2e               # Playwright (start the production preview first)
npx playwright test tests/stream-ui.spec.ts   # single suite
```

E2E prerequisites: `npm run build && npm start`, disposable `DATABASE_URL` (fixtures are inserted/deleted), **no** `NVIDIA_API_KEY` (missing-key UX is part of the spec), `TEST_BASE_URL` for non-default origins.

Audit history: `docs/CODE_REVIEW_REPORT.md` is upstream historical evidence. Current findings, regression evidence, and unresolved live-deployment issues are recorded in `docs/ENHANCEMENT_REVIEW.md`.

Enhancements: the shared SSE parser supports CR/LF/CRLF with network-independent event limits. Mobile navigation uses `navigation-frame.tsx` and Radix focus containment; an accessible close control must remain inside the drawer. `workspace-polish.css` owns scoped readability and error-contrast improvements. Browser tests use `*.spec.ts`; unit tests use `*.test.mjs`. Only `tests/live-readonly.spec.ts` may run against the live website; fixtures and destructive tests require a disposable local database.

## Code Quality Standards

- Gate order: `npm run typecheck` → `npm run lint` → `npm test` → `npm run build`.
- Never weaken a gate to pass it (no loosening types, no removing tests, no disabling rules) — fix the underlying issue.
- Structured logs only: `console.error(JSON.stringify({ operation, ids, errorType }))`.

## Git & Version Control

- All work lands on `main` (no feature branches in this repo's workflow).
- Atomic commits with descriptive messages explaining *why*; run the full gate order before each commit.
- Never commit secrets; `.env*` is ignored. If a secret lands in history, rotate it.

## Error Handling & Debugging

- `ApiError(status, message)` + `errorResponse()` is the single error funnel for API routes; user-facing copy is specific ("what happened, what to do").
- `errorResponse` logs `operation` + `requestId` + error type; surface the `requestId` in the 500 body for support correlation.
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
| `/api/chat` | POST | SSE stream; origin-checked; session lease (429 on conflict) |
| `/api/conversations` | GET | Sets session cookie; returns list + `configured` flag |
| `/api/conversations/[id]` | GET/PATCH/DELETE | Ownership enforced; rename validates 1–100 chars; delete is transactional and refuses while a response is running |
| `/api/health` | GET | DB connectivity only; does not validate the provider key |

### Database / Data Layer

- Drizzle + `pg.Pool` (cached on `globalThis` in dev). Schema in `src/db/schema.ts`; conversations store `messages` as JSONB; FK cascade from sessions.
- Use parameterized Drizzle queries exclusively; never string-concatenate SQL.

### Environment Variables

| Variable | Purpose | Notes |
|----------|---------|-------|
| `DATABASE_URL` | PostgreSQL connection string | Required; app throws without it |
| `NVIDIA_API_KEY` | Provider key (server-only) | Optional locally; missing key → 503 with guidance |
| `TEST_BASE_URL` | Playwright target origin | Optional; default `http://localhost:3000` |

## Anti-Patterns to Avoid

- Over-engineering: no speculative config, feature flags, or abstractions beyond the request.
- Generic error text replacing the curated user-facing copy.
- Persisting partial provider answers or fabricating fallback responses.
- Logging message contents, cookies, or the API key.
- Editing files under `skills/`, `sample-build/`, or `docs/` as if they were app code.
