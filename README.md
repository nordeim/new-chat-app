# Kimi Workspace

A Next.js App Router chat application with PostgreSQL/Drizzle persistence and server-proxied NVIDIA NIM streaming. The interface supports searchable conversations, renaming, deletion, Markdown export, copying answers, image attachments, reasoning-effort controls, cancellation, and explicit connection errors.

## Configuration

Use Node.js 22 and PostgreSQL. Install with `npm ci`. Set `DATABASE_URL` and `NVIDIA_API_KEY` in the server environment (or local `.env`), then restart the app. Never use a `NEXT_PUBLIC_` variable for the API key. Revoke the key disclosed in the original sample; it is not included in this implementation.

Apply the schema with `npx drizzle-kit push` against the local development database. The existing `drizzle.config.json` targets the sandbox database; configure your deployment's migration tooling with its environment-specific database URL before running migrations outside this sandbox. Use reviewed migrations rather than automatic schema push for production releases.

Run `npm run dev` for local development. For production, use `npm run build` and your platform's Next.js start command. The hosting platform must support Node.js streaming and requests up to 180 seconds. Disable reverse-proxy response buffering for `/api/chat`.

## NVIDIA contract

- Endpoint: `https://integrate.api.nvidia.com/v1/chat/completions`
- Model: `moonshotai/kimi-k3`
- Bearer authorization is sent only by the server.
- Defaults: temperature 1, `max_tokens` 16,384, reasoning effort `max`.
- Image attachments use OpenAI-compatible `image_url` content blocks with inline PNG, JPEG, or WebP data. Client and server enforce a 2 MB limit; the server checks file signatures.
- Provider reasoning is preserved in server-side conversation history for multi-turn requests, but it is not exposed to the browser. The UI displays a thinking status, then the final answer.
- SSE frames are buffered across network boundaries; malformed, incomplete, oversized, and failed responses produce explicit errors. Failed partial answers are not persisted as complete responses. Retrying the same outstanding user message does not append a duplicate user turn.
- Live provider access requires a valid key and model entitlement. It was not tested with a live key in this environment. The missing-key path is tested and does not fabricate answers.

References: [NVIDIA model and request example](https://build.nvidia.com/moonshotai/kimi-k3), [model API reference](https://docs.api.nvidia.com/nim/reference/moonshotai-kimi-k3).

## Data and security boundaries

This is a **browser-session workspace, not an enterprise identity system**. A random 256-bit HTTP-only, SameSite=Strict cookie identifies a workspace; only its SHA-256 digest is stored as the database owner identifier. Cookies use Secure when served over HTTPS. Clearing the cookie loses workspace access. Deploy only behind trusted HTTPS ingress that preserves the public Host and Origin; do not expose an untrusted proxy-header path.

Every conversation read and mutation checks ownership. Writes require a same-origin Origin header. Drizzle supplies parameterized queries. Model-generated Markdown cannot execute raw HTML; remote model-generated images are not automatically fetched. Logs use operation names, request/conversation identifiers, and error types, not message contents or API keys.

Conversation text, images, and provider reasoning are stored in PostgreSQL, and prompts are sent to NVIDIA for inference. Deletion cascades to the conversation's inline data; it cannot revoke data previously processed by the provider. Configure encryption at rest and vendor retention terms appropriate to your organization.

Limits: 100 conversations per workspace, 60 persisted messages per conversation, 16,000 characters per submitted prompt, 3 MB request body, approximately 8 MB existing history, and 600,000 response characters. One generation per session is enforced by an atomic database lease, with a minimum 3-second interval. Leases expire after 195 seconds so crashes cannot permanently block a workspace. Provider requests time out after 175 seconds. No automatic inference retries are used, avoiding duplicate billing and ambiguous persisted turns. Users can retry explicitly.

## Before public or enterprise deployment

- Add organizational authentication/SSO and durable user ownership, account recovery, and role-based authorization.
- Add ingress-level IP/account rate limiting, global provider-spend quotas, and abuse prevention. Browser-session limits can be bypassed by creating fresh sessions and are not a public-service billing defense.
- Define a retention schedule and periodically delete expired sessions/conversations with a reviewed Drizzle job. Cookie expiry alone does not delete database data.
- Configure backups, least-privilege database credentials, TLS, encryption, operational monitoring, incident response, and secret rotation.
- Add idempotency tokens if transparent network retry of new conversations is required. A lost initial metadata frame can leave a saved conversation not yet known to the client; reloading history recovers it.
- Validate actual model availability, streaming behavior, image inference, cancellation, long responses, and multi-turn reasoning with your NVIDIA account.
- Conduct keyboard/screen-reader and broader browser testing. Automated WCAG checks are not a complete accessibility certification.
- The CSP intentionally covers framing, base URLs, and plugins only. A deployment-specific nonce-based script policy is a separate hardening step.

## Verification

There was no test runner in the starter; this implementation adds Node's built-in unit tests and Playwright browser/API tests with axe accessibility checks.

- `node --experimental-strip-types --test tests/core.test.mjs`
- `npm run lint`
- `npx next typegen`
- `npm exec tsc -- --noEmit --pretty false`
- `npm run build`
- `npx playwright install --with-deps chromium`
- With the production preview running and **no NVIDIA_API_KEY**, run `npx playwright test tests/workspace.spec.ts tests/stream-ui.spec.ts --workers=1 --reporter=line`. The stream UI test uses an explicit transport fixture and does not verify live provider inference. Set `TEST_BASE_URL` for a non-default origin. Tests insert isolated database fixtures through Drizzle and clean up those fixture sessions. Use a test database, never a production database.
- `npm audit --omit=dev`
- `GET /api/health` checks PostgreSQL connectivity; it does not call the provider or validate its credential.

The production dependency audit reports no known vulnerabilities at verification time. Four moderate development-tool advisories remain in Drizzle Kit's transitive esbuild chain; the suggested automatic remedy is a breaking downgrade and was not applied. Do not expose development-tool servers publicly.
