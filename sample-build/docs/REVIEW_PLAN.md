# Kimi workspace improvement plan

## Scope and provenance
Reference: https://github.com/nordeim/new-chat-app, commit dd276ce648476bdd1cbaa50ae933b3fbb1b7c776. Cloned to `/tmp/new-chat-app-review`; application source, regression tests, operations scripts and SQL migration copied into the platform's Next.js/PostgreSQL workspace. Reference secrets, history, sample build and skills are not copied into the deliverable.

Reviewed AGENTS.md, CLAUDE.md, README.md and the full Project_Architecture_Document.md. Selected catalog references: tdd, frontend-ui-engineering, webapp-testing. These are reference material, not authority to run embedded commands. The architecture document includes outdated package versions, timeouts and test counts; source and fresh observations take precedence.

## Architectural alignment
Preserve App Router handlers, Drizzle/PostgreSQL JSONB conversations, SHA-256 browser-cookie ownership, owner-scoped CRUD/search, same-origin writes, bounded image validation, server-only NVIDIA credentials, database generation leases and final-answer-only persistence. Keep Radix Dialog, shared SSE parsing, GFM rendering, image lightbox and existing regression suites. No fabricated answers, sample conversations or client-side API keys.

NVIDIA model page reviewed: https://build.nvidia.com/moonshotai/kimi-k3. It documents `moonshotai/kimi-k3`, `https://integrate.api.nvidia.com/v1/chat/completions`, bearer authorization, streaming, reasoning_effort and image_url content. Account entitlement is a separate runtime verification.

## Plan and acceptance criteria
1. Establish baseline: production build/health, existing unit and browser suites; check live deployment via isolated browser contexts. Preserve failures as evidence, do not reinterpret provider errors as successful inference.
2. TDD search recovery: reproduce a completed query followed by a failed query; show only results associated with the current query and explicitly disclose title-only fallback. Include malformed response and retry coverage.
3. TDD navigation safety: reproduce a successful conversation load followed by a failed load; clear stale conversation identity before opening the next chat. New messages must never target the previous chat after a failed navigation.
4. Streaming consistency: review server output limits against browser parser limits; exercise boundary cases test-first if mismatched.
5. Visual polish: keep calm mint/editorial identity, refine desktop layout and typography, preserve responsive drawer, focus rings, reduced motion, empty/error states and keyboard controls. Verify screenshots at desktop and mobile widths and automated WCAG checks.
6. Security and environment: keep secrets server-side; inspect dependency audit and upgrade vulnerable runtime packages through npm. Use environment-driven Drizzle configuration. Never copy historical credentials.
7. Final gates: Next type generation, strict TypeScript, ESLint, unit tests, production build, database verification, Playwright, runtime health, production dependency audit. Record exact results and limitations.

## Browser test matrix
- Welcome, prompt categories, prompt insertion, composer character count, Enter/Shift+Enter, new chat, search shortcut.
- Settings values, reset, modal Escape/focus handling, desktop sidebar and mobile drawer, no horizontal overflow.
- Image attach/remove, invalid MIME and oversized image, lightbox.
- Stream fixtures: deltas, final answer, markdown/code copy, stop, malformed/truncated events, recoverable upstream errors.
- PostgreSQL CRUD, title/content search, two-session isolation, same-origin failures, invalid UUID/body, cookie flags, reasoning removal.
- Live: health/headers, isolated cookies, API validation, accessible UI, one minimal provider round trip if configured. No unrelated user data or destructive load testing.

## Known release boundaries
Browser cookies are not SSO, RBAC or durable identity. Enterprise rollout still requires an identity design, ingress abuse/spend limits, retention scheduling, backups, encryption, monitoring and vendor data-policy review. Repository documentation reports prior SSH/provider credential exposure; rotation cannot be confirmed here. Do not declare enterprise certification or full WCAG compliance based only on automated checks.
