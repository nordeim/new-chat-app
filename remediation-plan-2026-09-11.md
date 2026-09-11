# Remediation Plan — Pass 7 Findings (2026-09-11)

Companion to `docs/CODE_REVIEW_REPORT.md` (Pass 7). Every code item below was
executed test-first (red → green) and verified against the full gate order.
Operator-only items are recorded here because no code change can close them.

## Findings → ToDo list

| ID | Severity | Finding | Root cause | Fix | Tests | Status |
|----|----------|---------|------------|-----|-------|--------|
| A1 | 🔴 Critical (operator) | Live deployment's `NVIDIA_API_KEY` rejected by NVIDIA (401/403); every send shows the curated key-rejection banner; `configured: true` | Dead credential on the server (carried C2 rotation) | Rotate the key in the deployment environment, then re-run the live suite (expect 12/12) | `tests/live-site.spec.ts` provider round-trip | **OPEN — operator** (code path verified working via meta → curated-error → lease-release) |
| A2 | 🔴 Critical (operator, carried) | SSH private key + NVIDIA keys remain in git history | Historical commits (`docs/ssh-key.txt`, `.env` chain from passes 1–6) | Rotate both credentials at GitHub/NVIDIA; optional history rewrite with operator sign-off | CI secret scan (already clean on app code) | **OPEN — operator** |
| R1 | 🟢 Low | 70-code-point auto-title can exceed the rename schema's 100-UTF-16-unit cap for astral-heavy prompts (rename round-trip would 400) | `deriveTitle` enforced only the code-point cap | Dual cap: trim whole code points until ≤100 UTF-16 units as well | `deriveTitle stays within 100 UTF-16 units for astral-heavy prompts` (red → green) | ✅ FIXED |
| R2 | 🟢 Low | New 409 test could leak a session row if the cookie were missing (early throw before cleanup registration) | Owner registered for `finally` cleanup after a non-null dereference | Register owner with `cookie?.value ?? ""` before assertion; explicit cookie assertion moved after registration | Failure-path inspection (cleanup now unconditional) | ✅ FIXED |
| R3 | ⚪ Info | `\s+` collapse also converts Unicode whitespace (NBSP, U+3000) — behavior desirable but undocumented | Missing comment/test | Documented in `src/lib/title.ts` header; pinned by test | `deriveTitle collapses Unicode whitespace to single spaces` | ✅ FIXED |
| R4 | ⚪ Info | Code-point cap could leave a trailing space in the stored title | Slice semantics | `trimEnd()` on the capped result | `deriveTitle never ends with a trailing space after the cap` (red → green) | ✅ FIXED |
| R5 | ⚪ Info | Empty / whitespace-only `deriveTitle` input untested (unreachable via route zod `.trim().min(1)`) | Contract gap for the exported helper | Pinned by test | `deriveTitle returns an empty string for empty or whitespace-only input` | ✅ FIXED |
| R6 | ⚪ Info (deferred I5) | Lighthouse baseline stale after pass-6 render-path change | Pass 6 changed fonts/layout | Re-baselined against the live deployment | Lighthouse v13.4.1 (headless chromium) | ✅ DONE — **97 perf / 100 a11y / 100 best-practices**; FCP 1.6 s, LCP 2.3 s, TBT 120 ms, CLS 0, SI 1.6 s, TTI 2.9 s (SEO 63 is by-design `noindex`) |
| R7 | ⚪ Info (carried I2) | 429 lease-conflict has no automated API test | Reaching the lease requires a configured provider key; repo disposition = accepted backlog | No code change; live verification recorded | Direct live probe (2026-09-11): immediate second send → 429 with documented copy | **Documented — disposition unchanged** |
| — | 🟡 Medium (carried M4) | dev-only esbuild chain vulnerabilities (4 moderate via drizzle-kit) | Upstream drizzle-kit dependency | Suggested fix is a breaking downgrade — documented tradeoff, unchanged | `npm audit` | **Carried — documented** |
| — | ⚪ Info (carried I3/I6) | Nonce-based CSP `script-src`; retention cron schedule | Deploy-time / operator scheduling | Operator actions, documented in README "Before public or enterprise deployment" | — | **Carried — operator** |

## Improvement changes covered by this plan (executed test-first)

1. **Mutation-failure curated copy** — `mutateConversation` (rename/delete) now
   renders `WorkspaceRequestError` copy verbatim and actionable network
   guidance for raw transport failures; closes the pass-6 error boundary's
   last surface. Red evidence: toast showed raw `Failed to fetch`.
   Test: `tests/recovery.spec.ts`.
2. **Whitespace/surrogate-safe auto titles** — `src/lib/title.ts`
   (`deriveTitle`) replaces `content.slice(0, 70)` in the chat route's insert
   path. Tests: 10 unit cases in `tests/core.test.mjs`.
3. **409 delete-while-generating regression test** — DB fixture claims the
   lease, DELETE → 409 with documented copy, lease reset → DELETE 200, cascade
   cleanup. Test: `tests/workspace.spec.ts`.

## Verification evidence (post-remediation)

| Gate | Command | Result |
|------|---------|--------|
| Type safety | `npm run typecheck` (`next typegen` + `tsc --noEmit`) | ✅ |
| Lint | `npm run lint` | ✅ 0 problems |
| Unit tests | `npm test` | ✅ **41/41** (31 core + 7 origin + 3 stream-limit) |
| Build | `npm run build` | ✅ 6 routes |
| Local E2E | Playwright vs production build on embedded PostgreSQL 18.4 | ✅ **31/31** (12 live skipped by design) |
| Live E2E | `LIVE_SITE_URL=https://kimi-chat.jesspete.shop …` | ⚠️ 11/12 (A1 — operator key rotation) |
| Secret scan | `git grep` credential patterns (app code) | ✅ clean |
| Prod dependency audit | `npm audit --omit=dev` | ✅ 0 vulnerabilities |

## Plan validation against the codebase

- `deriveTitle` is wired only into the insert path (`src/app/api/chat/route.ts`);
  rename keeps `titleSchema` (1–100 UTF-16 units) — the dual cap keeps both
  paths mutually consistent (Verified by unit tests on both sides).
- The mutation-toast boundary uses the same `WorkspaceRequestError` class as
  the send/open paths — one policy, three surfaces (Verified: all three have
  E2E coverage).
- The 409 test follows the established DB-fixture pattern (Drizzle + owner
  hash + cascade cleanup) and asserts the exact documented copy string.
- No gate was weakened: no rules disabled, no tests deleted, no `@ts-ignore`.
