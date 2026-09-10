# Enhancement review and acceptance plan

## Baseline and scope

Source cloned from https://github.com/nordeim/new-chat-app.git into /tmp/new-chat-app. The application source, tests, MIT license, and security configuration are integrated into the platform workspace; repository history and archived reference bundles are not copied. The platform database connection is preserved. AGENTS.md, CLAUDE.md, README.md, the prior audit, sample-build README, and relevant skills informed the plan.

The existing architecture fits the request: App Router → same-origin/session guard → Zod → atomic PostgreSQL lease → NVIDIA SSE → final answer persistence. Retain browser-cookie ownership, bounded inline images, safe Markdown, server-only credentials, and explicit failure messages. The reference build lacks workspace isolation and uses public image files, so those patterns are intentionally not adopted.

Provider contract checked against https://build.nvidia.com/moonshotai/kimi-k3: model moonshotai/kimi-k3; POST https://integrate.api.nvidia.com/v1/chat/completions; Bearer auth; stream=true; image_url content blocks; temperature, max_tokens, reasoning_effort.

## Findings to reproduce before remediation

| Severity | Location | Evidence / impact | Plan | Initial confidence |
|---|---|---|---|---|
| High | Sandbox dependency baseline | npm audit reports critical Next.js advisories in 16.2.6 | Upgrade to patched 16.3.4, audit again | Verified registry finding; exploitability not assessed |
| Medium | src/lib/sse.ts | Whole network-chunk cap rejects individually valid coalesced events; CR-only framing unsupported; multiline budget omits separators | Regression tests; per-event budget and linear line processing | Reasoned |
| Medium | chat-workspace.tsx/openConversation | Clears messages before fetch but retains currentId on failure; later sends can target an unseen old chat | Reproduce through browser transport fixture; clear selected ID before request | Reasoned |
| Medium | Mobile navigation | Custom aside/scrim lacks modal focus containment and Escape behavior | Live read-only reproduction and local regression; reuse Radix dialog | Reasoned |
| Low | globals.css | Responsive overrides shrink text to 7–9px; composer input 12px on mobile | Typography/target-size polish with viewport and axe checks | Verified source values; usability impact reasoned |

## TDD sequence and acceptance criteria

1. Preserve baseline test suite and run original unit tests and production bootstrap.
2. Add failing SSE cases, failed-load browser reproduction, and mobile Escape/focus tests.
3. Fix parser and stale identity without changing API/storage contracts. Use Radix primitives for mobile focus management.
4. Refine existing calm mint design, deliberate typography, useful empty/loading states, and responsive composer. No invented conversations or simulated provider answers in product code.
5. Run all unit, lint, strict type-generation/typecheck, production build, and Playwright suites. Verify PostgreSQL state with Drizzle-backed isolation tests, not just migration exit status.

## Browser E2E matrix

- Live URL: only read-only discovery, prompt filling without sending, settings, mobile navigation, screenshots, browser errors and axe. No production fixtures, deletes, or paid inference.
- Local real database: session creation/cookie flags; owner-scoped list/read/rename/delete; hostile origins, malformed input, missing provider key; actual saved chat opened in UI.
- Local deterministic provider transport: successful streaming, GFM tables, interrupted stream with retry, stale navigation failure.
- UI: prompt categories; image attach/remove; settings/reset; mobile 390×844; desktop 1440×1000; keyboard focus and Escape; no horizontal overflow.
- Final gates: next typegen → tsc --noEmit → lint → node:test → production build → managed build/start → Playwright.

## Pre-mortem / deployment boundaries

Malformed JSON/images are bounded and validated server-side; session ownership and same-origin writes remain authoritative. Lease and transactional delete handle concurrent generations. Failed provider output is not persisted. New-conversation network retries still lack a client idempotency token; do not retry inference automatically. Cookie loss is not account recovery. Retention, SSO/RBAC, ingress abuse controls, spend limits, backups, encryption, and organizational audit events remain enterprise deployment work. Prior repository audit reports an exposed SSH key in history: rotation/revocation must be confirmed by the operator. No live NVIDIA inference claims without credential-backed execution.

## Verification results — current workspace

Upstream source revision: `820a2668adcbce4e4f10706286c438f25fe406aa`. No changes were pushed to GitHub or deployed to the live website.

| Gate | Observed evidence | Confidence |
|---|---|---|
| Initial unit baseline | 5/5 original tests passed | Verified |
| TDD parser reproduction | All 3 new framing/budget tests failed against the original parser, then passed after the fix | Verified |
| TDD UI reproduction | Stale selection, Escape dismissal, and focus containment failed locally before changes; interrupted-stream recovery already passed | Verified |
| Type generation | `npx next typegen` passed | Verified |
| Strict TypeScript | `npm exec tsc -- --noEmit --pretty false` passed | Verified |
| Lint | `npm run lint` passed | Verified |
| Final unit suite | 8/8 passed | Verified |
| Production compilation | `npm run build` passed on Next.js 16.3.4 | Verified |
| Managed runtime | Production bootstrap/start and `/api/health` check passed | Verified |
| Browser suite | 18/18 Chromium tests passed in 13.6 seconds against local production build | Verified |
| Real database behavior | Owner-isolation, rename/delete persistence, saved-chat reload, and final deletion state asserted through Drizzle | Verified |
| Accessibility | Axe WCAG A/AA checks passed for workspace, settings, and workspace failure/retry state; mobile keyboard focus and Escape tests passed | Verified; not full WCAG certification |
| Dependency audit | `npm audit --omit=dev`: zero vulnerabilities; full audit: four moderate migration-tool advisories | Verified at execution time |
| Screenshots | `artifacts/workspace-desktop.png` (1440×1000), `artifacts/workspace-mobile.png` (390×844) | Verified browser captures |
| NVIDIA inference | No configured server key. Tests cover missing-key UX and deterministic browser transport, not real provider inference | Not executed |

The first expanded browser run also exposed two integration issues that were fixed, not suppressed: an externally labelled backdrop was hidden by Radix, so a close control was added inside the drawer; two database suites shared a pool but independently ended it, so database journeys now live in one suite with one teardown. Error-state axe coverage identified transient opacity contrast and an unfocusable short-screen history scroll region; the welcome opacity animation was removed and history made keyboard-focusable. All original assertions remain.

Node's direct TypeScript test runner emits a non-failing module-type warning because the starter manifest is not declared ESM. This does not affect the compiled Next.js application.

## Live-site audit — unresolved deployment findings

The read-only live suite failed 2/2 checks; these failures are not represented by the local 18/18 result. No production messages were submitted, modified, or deleted.

### L1 — Workspace initialization returns HTTP 500

- **Severity:** Critical for the live application's core path.
- **Location:** `https://kimi-chat.jesspete.shop/api/conversations`.
- **Evidence:** A real Chromium navigation observed HTTP 500 and the banner “The workspace could not complete this action. Please try again.” Screenshot: `artifacts/live-before.png`.
- **Impact:** The session/history initialization cannot complete, so sending is unavailable.
- **Recommended action:** Inspect deployment logs for `conversations.list` and correlate the response request ID; verify database connectivity, configured database URL, and applied schema. Do not assume a cause or run destructive tests on the live database.
- **Confidence:** Verified symptom; root cause unverified without deployment logs/access.
- **Status:** Open in live deployment. Local schema, persistence, and health are verified.

### L2 — Mobile navigation does not close with Escape

- **Severity:** Medium.
- **Location:** Mobile sidebar at 390×844.
- **Evidence:** The live browser test pressed Escape after opening the drawer; “Collapse sidebar” remained visible after the assertion timeout.
- **Impact:** Incomplete keyboard dismissal and focus management.
- **Recommended fix:** Deploy the Radix navigation frame and in-drawer close control included here.
- **Confidence:** Verified live failure and local regression fix.
- **Status:** Fixed locally; not deployed live.

### L3 — Error banner has insufficient text contrast

- **Severity:** Medium.
- **Location:** `.error-banner > div`.
- **Evidence:** Live axe report measured `#887349` on `#fffaf0`, 4.39:1 instead of 4.5:1.
- **Impact:** Error guidance fails WCAG AA normal-text contrast.
- **Recommended fix:** Deploy the stronger warning token and maintain error-state axe coverage.
- **Confidence:** Verified live failure and passing local regression.
- **Status:** Fixed locally; not deployed live.

## Remaining risks and review limits

- **Historical Critical — exposed SSH key:** Upstream audit reports a private key in git history. Current revocation/rotation status is not independently verified. Operator confirmation is required; no historical key material was read or copied.
- **Medium, Reasoned — message-limit boundary:** The existing chat route checks history length before appending. A different prompt after an outstanding failed user turn near the 60-message boundary can exceed the nominal final-message cap by one. This inherited edge case was not exercised with an entitled provider and remains a server-boundary follow-up; do not treat the documented nominal cap as a strict persisted-count invariant.
- **Medium, Verified dependency metadata — development tooling:** Four moderate advisories remain in the Drizzle migration-tool esbuild chain. The suggested forced fix is a breaking downgrade, so it was not applied. Production dependency audit is clean.
- Browser coverage is Chromium, not a cross-browser or screen-reader certification. No provider load, billing, multimodal inference, retention, backup-restore or SSO tests were performed.
- This deliverable is a tested and polished browser-session starter, not a claim that all enterprise deployment prerequisites are satisfied.
