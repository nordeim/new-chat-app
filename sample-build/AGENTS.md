# Kimi workspace — maintainer notes

This is the enhanced starter derived from nordeim/new-chat-app at dd276ce648476bdd1cbaa50ae933b3fbb1b7c776. Source provenance, scope and rollout limitations are in README.md and docs/REVIEW_PLAN.md. The reference documents were reviewed, not copied as current implementation claims.

- Next.js App Router, React, strict TypeScript, Drizzle/PostgreSQL, Radix Dialog, shared SSE parsing.
- Import the database through `@/db`; server credentials are `DATABASE_URL` and optional `NVIDIA_API_KEY`.
- Every conversation operation must enforce owner isolation. Writes must pass the trusted-ingress-aware origin gate.
- Do not expose credentials or provider reasoning in browser payloads or logs.
- Keep partial answers retryable; persist only completed answers. Keep the deferred busy-state reset after Stop (Chromium activation regression).
- Search results carry their query. Failed searches must disclose title-only fallback and offer retry.
- Clear old conversation identity before navigation; failed loading must not preserve the previous send destination.
- Provider SSE parser bound is 1M; browser bound is 8M to accommodate JSON escaping of the 1.2M-character final answer. Keep limits bounded and regression-tested.
- Styling: base in globals.css, editorial refinement in workspace-polish.css. Preserve keyboard scrolling and Radix focus behavior.
- Migrations: `npx drizzle-kit generate`, review SQL, `npx drizzle-kit migrate`. No production `push`, no artificial seed histories.
- Tests: `node --experimental-strip-types --test tests/*.test.mjs`; Playwright via direct `npx playwright test` commands in README. Use a disposable database, no provider key for local tests, one test process per artifact output directory.
- Final gates: next typegen, strict tsc, lint, unit tests, production build, managed runtime start/health and browser regression suites. Never weaken existing tests to make gates pass.
- Public rollout still requires SSO/RBAC/recovery, global abuse/spend limits, backups, retention policy and operational monitoring. Historical credential rotations cannot be assumed complete.
