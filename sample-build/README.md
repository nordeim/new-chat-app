# Kimi — a little more possible

A calm, mint-accented Next.js chat workspace with NVIDIA Kimi K3 streaming, PostgreSQL conversations, searchable history, Markdown/code rendering, image input, and accessible Radix dialogs.

Adapted from [nordeim/new-chat-app](https://github.com/nordeim/new-chat-app) at `dd276ce648476bdd1cbaa50ae933b3fbb1b7c776`. The source clone was reviewed in `/tmp/new-chat-app-review`; this directory is the enhanced, deployable starter. No credentials or reference-repository git history were imported. See [review plan](docs/REVIEW_PLAN.md) and [verification report](docs/VERIFICATION.md).

## Run

Node.js 22+ and PostgreSQL are required. Install with `npm ci`. Configure `DATABASE_URL` in `.env` or the server environment. Set `NVIDIA_API_KEY` on the server for real inference; never prefix it with `NEXT_PUBLIC_` and never paste it into a chat.

- `npx drizzle-kit migrate` — apply the included journaled SQL migration.
- `npm run dev` — development workspace.
- `npm run build` then `npm start` — production deployment.
- `GET /api/health` — PostgreSQL connectivity, not NVIDIA entitlement.

The managed preview already provides PostgreSQL and starts the production server. Missing NVIDIA credentials produce explicit connection guidance and preserve the draft; there are no fabricated model responses. Migration configuration reads `DATABASE_URL`, not a hard-coded local connection string. For new schema changes use `npx drizzle-kit generate`, review the SQL, then migrate. Do not use `push` on a production database.

## What is included

- Streamed NVIDIA responses with thinking status, stop, retry and truncation notices.
- Session-isolated saved conversations, title/content search, rename, delete and Markdown export.
- Image attach, paste and drop (PNG/JPEG/WebP, up to 2 MiB), server signature checks, lightbox.
- Model controls for temperature, reasoning and output limit; defaults follow NVIDIA's model example.
- Sanitized GFM, highlighted code, response/code copy controls.
- Mobile navigation, keyboard shortcuts, focus-visible styles and reduced-motion support.
- Explicit title-only search fallback with retry during full-text search failures.

## Architecture and API

Browser → Next.js route handlers → validation/session/lease → NVIDIA SSE → final-answer persistence → browser SSE. PostgreSQL access uses Drizzle. One database lease serializes generations per workspace. Failed partial answers are not persisted. Provider reasoning is stored for multi-turn context but stripped from browser responses.

| Route | Contract |
|---|---|
| `GET /api/conversations?q=` | Session bootstrap, owner-scoped list/search, provider-configured flag |
| `GET /api/conversations/[id]` | Full owner-scoped conversation, no provider reasoning |
| `PATCH /api/conversations/[id]` | Same-origin rename, 1–100 character title |
| `DELETE /api/conversations/[id]` | Same-origin delete; rejects during generation |
| `POST /api/chat` | Same-origin, validated input, streamed `meta/thinking/delta/done/error` events |
| `GET /api/health` | Database readiness probe |

Main files: `src/components/chat-workspace.tsx`, `src/app/api/chat/route.ts`, `src/lib/server.ts`, `src/lib/sse.ts`, `src/db/schema.ts`. Original design tokens/component styling remain in `globals.css`; the scoped visual refinement layer is `workspace-polish.css`.

Limits: 16,000 prompt characters, 3 MB HTTP body, 100 conversations, 60-message admission bound, 16 MB history admission bound, 1.2M response characters including reasoning. A completed response may exceed the history admission bound by one message. Provider SSE frames remain capped at 1M characters; the browser parser permits 8M to accommodate a JSON-escaped final answer. Normal inference times out after 175 seconds; larger output settings permit 590 seconds. Reverse proxies must support these durations and disable SSE buffering.

NVIDIA contract verified from [the model page](https://build.nvidia.com/moonshotai/kimi-k3): `moonshotai/kimi-k3`, OpenAI-compatible `https://integrate.api.nvidia.com/v1/chat/completions`, bearer authorization, SSE and `image_url` content blocks. Model listing is not proof of account entitlement.

## Verification commands

- `npx next typegen`
- `npm exec tsc -- --noEmit --pretty false`
- `npm run lint`
- `node --experimental-strip-types --test tests/*.test.mjs`
- `npm run build`
- `TEST_BASE_URL=http://localhost:3000 npx playwright test tests/recovery.spec.ts tests/network-recovery.spec.ts tests/workspace.spec.ts tests/stream-ui.spec.ts`
- `TEST_BASE_URL=https://kimi-chat.jesspete.shop LIVE_SITE_URL=https://kimi-chat.jesspete.shop npx playwright test tests/live-site.spec.ts`
- `npm audit --omit=dev`

Install the browser with `npx playwright install chromium --with-deps`. Local DB-backed tests require a disposable database and no NVIDIA key; streaming UI tests use explicit transport fixtures. Run Playwright processes sequentially or give each its own `--output` directory. The live suite uses isolated browser contexts, sends one small provider prompt if configured, verifies saved assistant content, and deletes that test-owned chat on successful completion. Do not run load tests against the public deployment.

The starter keeps its existing npm script names; tests and migrations above are direct CLI commands. Optional legacy migration/seed wrappers were not retained because they used raw database calls and suppressed some failures. No artificial conversations are seeded.

## Security and release boundaries

A random HttpOnly, SameSite=Strict cookie identifies the workspace; only its SHA-256 digest reaches the database. Cookies are Secure over HTTPS. All conversation reads/writes check ownership. Clearing cookies loses access; this is **not** durable organizational authentication. Deploy behind trusted HTTPS ingress that preserves the public Host or supplies a trustworthy `x-forwarded-host` and `x-forwarded-proto`. Do not allow clients to bypass that ingress.

Prompts, attachments and reasoning are stored in PostgreSQL and sent to NVIDIA for inference. Avoid sensitive data until your organization approves the provider's terms and deployment controls. Session-scoped throttling is not global abuse/spend protection. CSP currently limits framing/base/plugin behavior; a nonce-based script policy remains deployment work.

Before an enterprise release: add SSO/durable ownership/RBAC/recovery, ingress rate limits and spend quotas, encrypted backups and recovery testing, encryption at rest, retention policy, incident response and monitoring. The reference repository documents historical SSH and NVIDIA secret exposure; operator rotation remains unconfirmed. This build does not rotate or redeploy the live website.

Retention is available with `node --experimental-strip-types scripts/prune-expired.mjs --idle-days 30`, optionally `--conversation-days 90`. Review and back up data before scheduling: idle is measured by last generation, not last read; never-used sessions have an epoch last-request value. Cookie expiry does not delete server data. No retention job is automatically scheduled.

Production dependency audit is clean in this environment. Four moderate development-only advisories remain in the Drizzle/esbuild chain; avoid exposing tooling development servers. A forced downgrade was intentionally not applied. Automated Chromium/axe checks do not establish complete WCAG conformance or a full security certification.

## License

MIT, preserving the upstream LICENSE. UI dependencies use MIT/ISC; Playwright uses Apache-2.0. The unmodified axe testing dependency uses MPL-2.0 (test tooling, not imported into the application).
