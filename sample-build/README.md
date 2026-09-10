# Kimi Workspace

A calm, mint-accented chat workspace built with Next.js 16, React 19, TypeScript, Tailwind v4, PostgreSQL and Drizzle. Based on [nordeim/new-chat-app](https://github.com/nordeim/new-chat-app), with tested streaming, navigation, readability and dependency improvements.

## Features

- Server-proxied NVIDIA Kimi K3 streaming, thinking status, stop and explicit retry.
- PostgreSQL conversation history with title search, rename, delete and Markdown export.
- PNG/JPEG/WebP attachments up to 2 MB, including paste and drag/drop.
- Temperature, reasoning effort and output-token controls.
- GFM Markdown answers; raw HTML and remote answer images are not executed/fetched.
- Browser-cookie workspace isolation; server-side ownership checks and same-origin writes.
- Responsive mint workspace with accessible Radix dialogs and a focus-managed mobile drawer.

## Run locally

Requires Node.js 22+ and PostgreSQL.

```sh
npm ci
cp .env.example .env
npx drizzle-kit push
npm run dev
```

Set `DATABASE_URL` for your database. The checked-in Drizzle configuration targets the local sandbox database; point migration tooling at the correct database before other deployments. Never run fixture suites against production.

For actual inference, set **`NVIDIA_API_KEY` in the server environment**, then restart. Do not paste a key into chat or use a `NEXT_PUBLIC_` variable. Without a key, the UI and saved-history APIs work, and sending shows connection guidance without discarding the draft. No fabricated fallback answers are used.

NVIDIA's [published model example](https://build.nvidia.com/moonshotai/kimi-k3) specifies `moonshotai/kimi-k3`, the OpenAI-compatible `https://integrate.api.nvidia.com/v1/chat/completions` endpoint, SSE, and `image_url` input blocks. Default controls: temperature 1, max tokens 16,384, reasoning effort `max`. Model access and real image inference require a valid entitled account; documentation verification is not an inference test.

## Architecture

| Module | Responsibility |
|---|---|
| `src/components/chat-workspace.tsx` | Workspace state, history, composer, settings and response rendering |
| `src/components/navigation-frame.tsx` | Radix mobile focus containment, Escape and focus restoration |
| `src/app/globals.css`, `workspace-polish.css` | Base mint design and scoped readability improvements |
| `src/app/api/chat/route.ts` | Validation → atomic generation lease → NVIDIA stream → persistence |
| `src/app/api/conversations/` | Owner-scoped list/read/rename/delete |
| `src/lib/server.ts` | Cookie hashing, origin guard, bounded JSON and structured errors |
| `src/lib/validation.ts` | Zod boundary schemas |
| `src/lib/sse.ts` | Shared incremental SSE parser; LF/CRLF/CR, per-event limits |
| `src/db/schema.ts` | Session and conversation tables, indexed ownership, JSONB messages |

The raw 256-bit cookie token never becomes a database owner ID; its SHA-256 digest does. Cookies are HTTP-only, SameSite=Strict and Secure over HTTPS. Deploy only behind trusted HTTPS ingress. Reads and mutations enforce ownership. Provider reasoning is retained server-side for multi-turn context but stripped from browser/API output.

One generation per session is guarded by a PostgreSQL lease with 3-second spacing and 195-second expiry. Requests time out at 175 seconds. Only completed provider answers are persisted; partial answers remain retryable. Deletion locks the session row to avoid a generation race. New-conversation transport retries still lack a durable client idempotency token, so inference is never retried automatically.

## API

| Route | Methods | Contract |
|---|---|---|
| `/api/conversations` | GET | Initializes cookie, returns up to 100 summaries and server key-configuration flag |
| `/api/conversations/[id]` | GET / PATCH / DELETE | Read, rename (1–100 chars), delete; all owner-scoped |
| `/api/chat` | POST | SSE `meta`, `thinking`, `delta`, `done`, `error`; same-origin writes |
| `/api/health` | GET | PostgreSQL connectivity, not provider credential validity |

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
npm audit --omit=dev
```

Playwright uses a production build and starts a temporary local server if one is not already running. Use a disposable local database and no NVIDIA key for the full suite. Set `TEST_BASE_URL=http://localhost:3000` to use an existing server. The `.spec.ts` discovery pattern keeps node:test files out of the browser runner.

Only the following read-only suite is suitable for the live website:

```sh
TEST_BASE_URL=https://kimi-chat.jesspete.shop npx playwright test tests/live-readonly.spec.ts
```

This suite does not send prompts, delete conversations, seed a database or invoke paid inference. Local provider transport fixtures test rendering and interrupted-response recovery; they do not establish real NVIDIA inference success.

Current findings, red/green evidence, validation results, and deployment limitations are in [the enhancement review](docs/ENHANCEMENT_REVIEW.md). Desktop/mobile screenshots are in `artifacts/`. The original repository's historical audit is retained as reference, not current verification.

## Enterprise deployment boundaries

This is a hardened **browser-session starter**, not an enterprise identity system. Clearing the cookie loses access. Before organizational deployment:

- Add SSO, durable user ownership, account recovery, RBAC and organizational audit events.
- Add ingress/account abuse prevention, global spend quotas and monitoring. Fresh cookies bypass per-session limits.
- Define retention and reviewed cleanup jobs; cookie expiry does not delete database data.
- Configure encryption at rest, backups, recovery tests, least-privilege database access and provider retention terms.
- Complete live-provider streaming, cancellation, multimodal and multi-turn tests using your account.
- Add deployment-specific nonce CSP, cross-browser and screen-reader testing.
- Confirm rotation/revocation of the SSH private key previously exposed in upstream git history. Removing the file did not revoke the key.

Prompts/images and provider reasoning are stored in PostgreSQL; submitted prompts/images are sent to NVIDIA. Do not submit sensitive organizational data until your retention and vendor policies are in place. Four moderate development-only migration-tool advisories remain; do not use an unsafe migration-tool downgrade to hide them.

## License

MIT, retaining the upstream license. Dependencies retain their own licenses; axe's MPL-2.0 code is used for automated testing.
