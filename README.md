# Kimi Workspace

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-087EA4?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A522-339933?logo=nodedotjs)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-306345.svg)](LICENSE)

A calm, mint-accented chat workspace with streamed NVIDIA responses, saved conversations, and image input — a clean Next.js/PostgreSQL starter.

Kimi Workspace solves a common problem: most chat starters stop at a single hardcoded prompt with no persistence, no streaming ergonomics, and no isolation between visitors. This project pairs a Next.js App Router client with server-proxied NVIDIA NIM inference (`moonshotai/kimi-k3`, OpenAI-compatible streaming endpoint) and PostgreSQL/Drizzle persistence. Conversations are isolated by a secure browser-session cookie, responses stream token-by-token over SSE, and the interface stays out of the way: searchable history, prompt starters, model settings, and an image-aware composer.

## Features

| ✨ | Feature | Description |
|----|---------|-------------|
| 🌊 | Streamed responses | Token-by-token SSE from NVIDIA NIM with a thinking indicator, stop control, and truncation notice |
| 💾 | Saved conversations | Postgres-backed history with search across titles **and message content** (⌘K), rename, delete, and Markdown export |
| 🖼️ | Image-aware composer | PNG/JPEG/WebP attachments under 2 MB, validated client-side and re-verified by magic bytes server-side |
| 🎛️ | Model settings | Temperature, output-token limit, and reasoning-effort controls per message |
| 🔒 | Session isolation | HTTP-only, SameSite=Strict cookie; only its SHA-256 digest is stored as the database owner |
| 🛡️ | Hardened API | Same-origin writes, bounded bodies, zod-validated payloads, atomic one-generation-per-session lease |
| 🧹 | Retention CLI | `npm run prune` removes idle sessions (cascade) and optionally stale conversations, with a structured log line |
| ♿ | Accessible UI | WCAG 2.2 AA verified with automated axe checks, keyboard operable, visible focus states |

## Architecture

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| UI | Next.js (App Router) + React | 16 / 19 | Single client component workspace, server route handlers |
| Language | TypeScript (strict) | 5.9 | End-to-end typed contracts |
| Styling | Tailwind CSS (CSS-first) | 4.1 | Mint design tokens in `globals.css` |
| Validation | zod | 4.6 | Shared client/server schemas |
| Data | Drizzle ORM + `pg` | 0.45 / 8.20 | Parameterized queries, JSONB message storage, versioned migrations in `drizzle/` |
| Database | PostgreSQL | 14+ | Sessions, conversations |
| AI | NVIDIA NIM (OpenAI-compatible) | — | `moonshotai/kimi-k3` streaming completions |
| Testing | node:test · Playwright · axe | — | Unit, API-isolation, E2E + WCAG checks |

```mermaid
flowchart LR
    Browser["Browser workspace"] -- "POST /api/chat (SSE)" --> Route["chat route handler"]
    Route -- "origin + session + lease" --> Guard["validation & limits"]
    Guard -- "OpenAI-compatible stream" --> NVIDIA["NVIDIA NIM · kimi-k3"]
    NVIDIA -- "SSE chunks" --> Route
    Route -- "meta/thinking/delta/done/error" --> Browser
    Route -- "persist final answer" --> PG[("PostgreSQL · Drizzle")]
```

### File hierarchy

```text
📂 drizzle                        # versioned SQL migrations (generate → migrate)
📂 src
├── 📂 app
│   ├── 📂 api
│   │   ├── 📂 chat                 # 📄 route.ts — SSE streaming proxy to NVIDIA
│   │   ├── 📂 conversations        # 📄 route.ts — list; 📂 [id] — read/rename/delete
│   │   └── 📂 health               # 📄 route.ts — DB connectivity probe
│   ├── 📄 layout.tsx               # Root layout + metadata
│   └── 📄 page.tsx                 # Renders the workspace
├── 📂 components
│   └── 📄 chat-workspace.tsx       # The complete client workspace (single component)
├── 📂 db
│   ├── 📄 index.ts                 # pg Pool + Drizzle instance
│   ├── 📄 schema.ts                # sessions & conversations tables
│   └── 📄 seed.ts                  # idempotent local-dev seed
└── 📂 lib
    ├── 📄 server.ts                # Cookie session, origin guard, bounded body reader
    ├── 📄 validation.ts            # All zod schemas
    ├── 📄 sse.ts                    # SSE parser (shared by server and browser)
    └── 📄 types.ts                  # Shared types + default model settings
```

## Quick Start

Requirements: **Node.js ≥ 22** and a **PostgreSQL** database.

1. Install and configure:

   ```bash
   git clone https://github.com/nordeim/new-chat-app.git
   cd new-chat-app
   npm ci
   cp .env.example .env        # then edit .env
   ```

2. Apply the schema and start:

   ```bash
   npm run db:migrate   # production-safe, journal-driven (or: npx drizzle-kit push for prototyping)
   npm run dev
   ```

   Schema changes: edit `src/db/schema.ts`, then `npm run db:generate` to create `drizzle/*.sql` and commit the migration. Seed a fresh DB with `npm run db:seed` (idempotent, local-only).

3. Verify setup:

   - `http://localhost:3000` shows the mint workspace with prompt starters.
   - `curl http://localhost:3000/api/health` returns `{"ok":true}`.
   - Without `NVIDIA_API_KEY`, sending a message shows the “Connect NVIDIA…” guidance and keeps your draft — by design.

### Docker Quick Start (local database)

```bash
  npm ci
  cp .env.example .env   # DATABASE_URL="postgresql://chat_user:chat_secret@127.0.0.1:5433/chat_db"
  docker compose up -d   # PostgreSQL 17 on 127.0.0.1:5433 (chat_user/chat_secret, dev only)
  npm run db:setup       # one-command: migrate + seed (curated errors + JSON summary)
  # or step-by-step:
  npm run db:migrate     # apply drizzle/*.sql (logs hash/sessions; idempotent — same [✓] for fresh and no-op)
  npm run db:seed        # idempotent demo row (logs inserted/reason/sessions)
  npm run dev
  curl http://localhost:3000/api/health  # {"ok":true}

  # schema change
  # 1) edit src/db/schema.ts
  # 2) npm run db:generate   # commits drizzle/*.sql + drizzle/meta/
  # 3) npm run db:migrate     # apply
  # 4) npm run typecheck && npm run lint && npm test && npm run build

  # cold-start check (destroys the volume): docker compose down -v, then up -> migrate -> seed
```

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string, e.g. `postgresql://user:pass@host:5432/db` |
| `NVIDIA_API_KEY` | For chat | Server-only key from [build.nvidia.com](https://build.nvidia.com). Never use a `NEXT_PUBLIC_` variable |
| `TEST_BASE_URL` | No | Playwright target origin (default `http://localhost:3000`) |
| `LIVE_SITE_URL` | No | Target for the live-deployment E2E suite (skipped when unset) |

## NVIDIA contract

- Endpoint: `https://integrate.api.nvidia.com/v1/chat/completions`, model `moonshotai/kimi-k3`, streaming via `Accept: text/event-stream`.
- Bearer authorization is sent only by the server; the key never reaches the browser.
- Defaults: temperature 1, `max_tokens` 16,384 (selectable up to 256,000), reasoning effort `max`.
- Image attachments use OpenAI-compatible `image_url` content blocks with inline PNG/JPEG/WebP data.
- Provider reasoning is preserved in server-side history for multi-turn requests but never exposed to the browser; the UI shows a thinking status, then the answer.
- Malformed, incomplete, oversized, and failed streams produce explicit errors; failed partial answers are not persisted, and retrying the same outstanding message does not append a duplicate user turn.
- Live provider access requires a valid key and model entitlement. The missing-key path is tested; live inference was not exercised in this environment.

References: [NVIDIA model page](https://build.nvidia.com/moonshotai/kimi-k3) · [API reference](https://docs.api.nvidia.com/nim/reference/moonshotai-kimi-k3)

## API reference

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/chat` | POST | Session cookie + same-origin | SSE stream: `meta`, `thinking`, `delta`, `done`, `error` events |
| `/api/conversations` | GET | Session cookie (sets one) | List up to 100 conversations + `configured` flag; optional `?q=` filters server-side by title and message content (case-insensitive, owner-isolated) |
| `/api/conversations/[id]` | GET | Session cookie | Full conversation with messages (reasoning stripped) |
| `/api/conversations/[id]` | PATCH | Session cookie + same-origin | Rename (1–100 characters) |
| `/api/conversations/[id]` | DELETE | Session cookie + same-origin | Delete; refuses (409) while a response is streaming |
| `/api/health` | GET | Public | PostgreSQL connectivity probe |

## Data and security boundaries

This is a **browser-session workspace, not an enterprise identity system**. A random 256-bit HTTP-only, SameSite=Strict cookie identifies a workspace; only its SHA-256 digest is stored as the database owner identifier. Cookies use `Secure` when served over HTTPS. Clearing the cookie loses workspace access. Deploy only behind trusted HTTPS ingress that preserves the public Host (or forwards it as `x-forwarded-host`, the Cloudflare/nginx convention — same-origin writes match against both) and does not expose an untrusted proxy-header path.

Every conversation read and mutation checks ownership. Writes require a same-origin `Origin` header. Drizzle supplies parameterized queries. Model-generated Markdown cannot execute raw HTML; remote model-generated images are not automatically fetched. Logs use operation names, request/conversation identifiers, and error types — not message contents or API keys.

Conversation text, images, and provider reasoning are stored in PostgreSQL, and prompts are sent to NVIDIA for inference. Deletion cascades to the conversation's inline data; it cannot revoke data previously processed by the provider. Configure encryption at rest and vendor retention terms appropriate to your organization.

Limits: 100 conversations per workspace, 60 persisted messages per conversation, 16,000 characters per submitted prompt, 3 MB request body, ~16 MB existing history (was 8 MB), and 1,200,000 response characters (was 600k; includes thinking + answer). One generation per session is enforced by an atomic database lease (195s; 615s for `max_tokens > 16,384`) with a 3-second spacing; provider requests time out after 175s (590s for large outputs) and the route allows up to 600s (`maxDuration`). No automatic inference retries are used, avoiding duplicate billing and ambiguous persisted turns; users can retry explicitly.

### Before public or enterprise deployment

- Add organizational authentication/SSO with durable user ownership, account recovery, and role-based authorization.
- Add ingress-level IP/account rate limiting, global provider-spend quotas, and abuse prevention. Browser-session limits can be bypassed by creating fresh sessions and are not a public-service billing defense.
- Add a retention schedule and run `npm run prune -- --idle-days 30 [--conversation-days 90]` periodically (e.g. weekly cron); it deletes idle sessions with their conversations and logs a structured summary. Cookie expiry alone does not delete database data.
- Configure backups, least-privilege database credentials, TLS, encryption at rest, operational monitoring, incident response, and secret rotation.
- Add idempotency tokens if transparent network retry of new conversations is required.
- Validate actual model availability, streaming behavior, image inference, cancellation, long responses, and multi-turn reasoning with your NVIDIA account.
- Conduct keyboard/screen-reader and broader browser testing; automated WCAG checks are not a complete accessibility certification.
- The CSP intentionally covers framing, base URLs, and plugins only; a deployment-specific nonce-based script policy is a separate hardening step.

## Testing

```bash
npm test                                   # unit: schemas + SSE parser (node:test)
npm run db:migrate                         # apply migrations (or db:generate first if schema changed)
npm run build && npm start                 # required for E2E
npm run test:e2e                           # Playwright: UI, API isolation, WCAG
LIVE_SITE_URL=https://your-deployment.example npx playwright test tests/live-site.spec.ts
npm audit --omit=dev                       # production dependency audit
```

E2E prerequisites: a disposable test `DATABASE_URL` (fixtures are inserted and cleaned up), **no** `NVIDIA_API_KEY` (the missing-key UX is part of the spec), and `TEST_BASE_URL` for non-default origins. The streamed-answer tests use explicit transport fixtures; the GFM-table test additionally routes both API endpoints, so it runs without a database. `tests/live-site.spec.ts` is skipped entirely unless `LIVE_SITE_URL` is set and exercises a real deployment (read-only except one minimal chat send when the provider is configured).

`GET /api/health` checks PostgreSQL connectivity; it does not call the provider or validate its credential.

## Project status & recent changes

Latest verification (2026-09-10, audit pass 3): typecheck, lint, build, 15/15 unit tests, 16/16 Playwright tests locally (proxied-origin and mobile-nav regression suites included), a full provider-contract round-trip against NVIDIA (structured error path verified with a rejected key), and a clean production dependency audit. The live deployment's database outage (pass 2 H2) is resolved — `https://kimi-chat.jesspete.shop/api/health` returns `{"ok":true}`. Full evidence and the severity-ranked finding list live in [`docs/CODE_REVIEW_REPORT.md`](docs/CODE_REVIEW_REPORT.md).

| Change | Notes |
|--------|-------|
| Proxy-aware same-origin checks | Same-origin writes now accept `x-forwarded-host` when the ingress rewrites `Host` (verified broken live: every browser send returned 403 behind Cloudflare). Pure `src/lib/origin.ts` with 7 unit tests + an API regression test |
| Modal mobile navigation | The mobile drawer is a Radix dialog: focus containment, Escape closes, focus restores to the opener, and an accessible close control lives inside the drawer |
| Incremental SSE parser | Adopted from `sample-build`: LF/CRLF/CR parity, split CRLF across chunks, exactly-one-space `data:` prefix handling, incremental size accounting |
| Hardened live E2E | The streaming test waits for a nonce inside an assistant message (no more false "streamed" from the user bubble), fails loudly on error banners, and verifies persistence |
| Secret hygiene | A tracked `.env` carrying a provider key was untracked (and the key, which NVIDIA rejects with 403, must still be rotated); a second embedded key in `docs/` was redacted; CI now runs a credential-pattern scan |
| CI trigger repaired | `branches: ain]` → `branches: [main]` — CI was silently skipping every push to `main`; production-only `npm audit` added |
| Accessibility in error states | Error-banner contrast raised to 4.5:1+ and the WCAG suite now scans the error state (pass 2) |
| Robust degraded-API UX | Non-JSON or contract-breaking API responses show curated copy instead of raw parse errors (pass 2) |
| Server-side search | `GET /api/conversations?q=` matches titles and message content, owner-isolated; ⌘K dialog queries it with a 250 ms debounce (pass 2) |
| Retention CLI | `npm run prune` deletes idle sessions (cascade) and optionally stale conversations; integration-tested (pass 2) |
| Live-deployment E2E | `tests/live-site.spec.ts` (env-gated via `LIVE_SITE_URL`) validates a deployed instance end to end |
| CI | `.github/workflows/ci.yml` runs secret scan → typecheck → lint → unit → build → prod audit, plus E2E against a PostgreSQL service container |
| HSTS | `Strict-Transport-Security: max-age=63072000; includeSubDomains` added app-side (enforced by TLS ingress) |
| Database lifecycle | `drizzle.config.ts` reads `DATABASE_URL` (no hard-coded sandbox URL), `npm run db:generate` → `drizzle/*.sql`, `npm run db:migrate` (production-safe, logs `hash/sessions`), `npm run db:seed` (idempotent, logs `reason/sessions`), `npm run db:setup` (migrate+seed, `migrationsApplied/inserted` summary, curated `PostgreSQL not reachable` preflight) |

## Design system

| Token | Hex | Usage |
|-------|-----|-------|
| `--canvas` | `#fcfdfb` | App background |
| `--sidebar` | `#f5f7f3` | Sidebar surface |
| `--mint` | `#e8f0e2` | Mint accent wash (chips, highlights) |
| `--green` | `#306345` | Primary accent, links, brand |
| `--green-dark` | `#244d36` | Primary accent hover |
| `--focus` | `#60926f` | Visible focus ring |
| `--danger` | `#a44539` | Errors and destructive actions |
| `--ink` / `--muted` / `--subtle` | `#26362f` / `#5f6c55` / `#626e65` | Text hierarchy |
| `--radius` | `14px` | Corner rounding |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| App fails to start: `DATABASE_URL is required` | Set `DATABASE_URL` in `.env` or the server environment, then restart |
| `npm run db:migrate` / `db:seed` / `db:setup` → `PostgreSQL not reachable at DATABASE_URL` | PostgreSQL is down or `DATABASE_URL` points at the wrong host/port. Run `docker compose up -d` and `curl /api/health`; check `DATABASE_URL` matches `docker-compose.yml` (`5433:5432`, `chat_user/chat_secret`) |
| `npm run db:seed → {"inserted":0,"reason":"already seeded"}` | Not a failure — the DB already has sessions. `inserted:1` only on a fresh DB (`docker compose down -v && up -d && npm run db:setup` → `1/1`). Same for `db:migrate`'s `[✓]` — it appears for both fresh apply and fast no-op (check the logged `hash/sessions` to distinguish) |
| `/api/health` returns `{"ok":false}` (HTTP 500) while the page still loads | The app cannot reach PostgreSQL. Check that the database behind `DATABASE_URL` is running, reachable from the server, and accepts the configured credentials; restart the app after fixing. The UI renders but sessions/conversations fail until this is green |
| “Connect NVIDIA…” banner on send | Add `NVIDIA_API_KEY` to the **server** environment and restart; the UI works without it |
| 429 “A response is already running” | One generation per session is enforced; wait a moment and retry |
| 403 “This action must be made from your chat workspace.” on send | Your ingress rewrites `Host` without forwarding the public hostname in `x-forwarded-host`. Configure the proxy to pass `x-forwarded-host` (Cloudflare/nginx default) or preserve the public `Host` |
| Playwright tests fail to connect | Start the production preview (`npm run build && npm start`) and set `TEST_BASE_URL` if non-default |
| Session reset loses conversations | Clearing cookies orphans the workspace owner — this is documented session behavior, not data loss |
| Reverse proxy buffers the stream | Disable response buffering for `/api/chat` (e.g. `X-Accel-Buffering: no` is sent; honor it) |

## License

Released under the [MIT License](LICENSE).
