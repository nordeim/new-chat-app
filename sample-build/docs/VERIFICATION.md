# Review and verification ledger

## Executive summary

Enhanced application delivered in the managed Next.js/PostgreSQL workspace, derived from upstream commit `dd276ce648476bdd1cbaa50ae933b3fbb1b7c776`. Reference clone remains at `/tmp/new-chat-app-review`. The supplied workspace was not a git repository; no upstream commit, push, credential rotation or live-site deployment was performed.

**Fixed findings:** 1 critical dependency advisory, 1 high correctness defect, 5 medium correctness/UX/accessibility defects. **Open:** intermittent live provider/transport failure (high, observed), one development-tooling advisory chain (medium, four npm findings), and operator-controlled enterprise deployment requirements. Two historical credential exposures are reported upstream; their rotation status is unverified, not newly independently established here.

**Final local results (Verified):** 31/31 unit tests, 28/28 Chromium browser tests, 3/3 additional repeated error-state accessibility checks, ESLint, Next type generation, strict TypeScript, production build, managed production startup and `/api/health`, and zero production dependency audit findings.

**Live results are mixed:** the original 12-test live suite passed, including an observed provider answer and a history entry. A later strengthened run completed the preceding UI/API checks without reported failures but its provider test failed with the deployed banner `network error`. Full persisted-assistant verification in that stronger test was therefore not reached. The live provider path is not declared reliable or fully green.

## Severity-ranked findings and remediation

### C1 — Vulnerable starter framework dependency (fixed)
- Location: original starter `next@16.2.6` / dependency lockfile.
- Evidence: npm production audit reported a critical Next.js advisory plus related runtime findings.
- Impact: release-blocking known dependency vulnerabilities; applicability of every individual advisory to this app was not independently exploited.
- Resolution: upgraded through npm to Next.js 16.3.4 with matching ESLint configuration; applied nonbreaking npm audit fixes. Final `npm audit --omit=dev` reports zero vulnerabilities.
- Confidence: **Verified** audit, installed versions and successful build.

### H1 — Failed navigation could target the previous conversation (fixed)
- Location: `src/components/chat-workspace.tsx`, `openConversation`.
- Evidence: open Alpha, fail loading Beta; breadcrumb remained Alpha and the previous ID stayed selected. Regression failed before fix.
- Impact: a fresh message could be sent with unintended previous context.
- Resolution: clear `currentId` before starting the new load. Sequence guard still rejects out-of-order responses. Browser test verifies the subsequent POST has no old conversation ID.
- Confidence: **Verified**, red → green in `tests/recovery.spec.ts`.

### H2 — Intermittent live provider/transport failure (open)
- Location: `https://kimi-chat.jesspete.shop/`, chat send journey.
- Evidence: original live suite passed in 47.3s. A subsequent minimal light-reasoning, 1,024-token request reached a saved user turn but displayed `network error` instead of an assistant answer. Playwright preserved a provider-test failure artifact.
- Impact: the deployed site's core inference journey can fail. The stronger test intentionally treats this as failure, not a successful degraded outcome.
- Recommended next step: correlate the test window with NVIDIA response status, route timeout/disconnect logs and ingress SSE timeout/buffering. Verify model entitlement/quota and repeat bounded text/image inference tests after correcting the identified cause. Do not blindly retry billable requests or change proxy security settings.
- Confidence: **Verified** user-visible failure; **Unverifiable here** whether NVIDIA, ingress or another network boundary caused it. No remote server/operator logs were available. This enhancement does not claim to fix that infrastructure issue.

### M1 — Search retained another query's results (fixed)
- Location: workspace search effect and `serverResults` replacement.
- Evidence: Alpha search succeeded; Beta search returned 503; Alpha remained in the dialog. Regression failed with one Alpha result when zero was expected.
- Impact: misleading search results and silent failure of full-text search.
- Resolution: query-associated result state, abort stale requests, explicit title-only fallback and retry. Both server-error and malformed-payload cases pass.
- Confidence: **Verified**, `tests/recovery.spec.ts`.

### M2 — Valid final answers exceeded browser parser bound (fixed)
- Location: `src/lib/sse.ts` and the browser parser construction.
- Evidence: server accepts 1.2M response characters, while browser final events were capped at 1M. Worst-case JSON escaping further expands the payload. New boundary test failed with `Stream event exceeds the size limit`.
- Impact: completed, persisted answers could appear failed in the browser.
- Resolution: validated configurable parser bound; provider keeps 1M, browser uses 8M. Both line and accumulated-event bounds remain enforced.
- Confidence: **Verified**, `tests/stream-limit.test.mjs`; pathological large-answer browser rendering performance was not load-tested.

### M3 — Raw browser network errors reached the banner (fixed locally)
- Location: workspace `sendMessage` error boundary.
- Evidence: live banner showed `network error`; local connection-reset regression showed `Failed to fetch`.
- Impact: unhelpful recovery guidance despite retained drafts.
- Resolution: distinguish curated application errors from transport failures. Network failures now say to check the network and retry; an unaccepted draft is retained. This is a UI recovery fix, not a fix for H2's unknown upstream cause.
- Confidence: **Verified**, `tests/network-recovery.spec.ts`, red → green.

### M4 — Empty scrolling history lacked a keyboard target (fixed)
- Location: workspace `nav.conversation-list`.
- Evidence: axe `scrollable-region-focusable` failure at a shorter viewport after visual changes.
- Impact: keyboard users could not scroll the empty history region in affected browsers.
- Resolution: keyboard-focusable labeled navigation. Existing axe checks were kept unchanged.
- Confidence: **Verified** automated regression; manual Safari/screen-reader testing remains outstanding.

### M5 — Welcome fade caused transient insufficient contrast (fixed)
- Location: inherited `welcome-in` opacity animation; refined in `workspace-polish.css`.
- Evidence: repeated axe run measured 4.41:1 on starter descriptions during entry. Browser inspection measured ancestor opacity ~0.45 while child text had opacity 1.
- Impact: text is briefly below AA contrast; automation exposed an actual visual state rather than a color-token mismatch.
- Resolution: position-only entry animation keeps text fully opaque. Full suite and three repeated error-state axe checks pass without changing test assertions.
- Confidence: **Verified** computed styles and test results.

### M6 — Development dependency advisory chain (open)
- Location: drizzle-kit → esbuild loader/tooling dependencies.
- Evidence: full npm audit reports four moderate findings; production-only audit reports zero.
- Impact: development-server exposure risks, not an audited clean development toolchain.
- Recommended action: monitor a compatible patched Drizzle/tooling release; keep tooling development servers private. npm's proposed automated fix was a breaking downgrade to drizzle-kit 0.18.1 and was not applied.
- Confidence: **Verified** npm audit; advisory exploit paths were not exercised.

## Verification ledger

| Check | Observed result | Evidence |
|---|---|---|
| Upstream guidance | Required four documents reviewed; skills catalog consulted for TDD/UI/testing; sample parser/Markdown compared | `docs/REVIEW_PLAN.md`, current architecture document |
| Unit baseline | 28 passed | `/tmp/kimi-unit-baseline.log` |
| TDD parser | 2 new boundary failures before fix, all pass after | `/tmp/kimi-limit-red.log`, `tests/stream-limit.test.mjs` |
| TDD search/navigation | Both failed before fix | `/tmp/kimi-recovery-red.log` |
| TDD network | Raw `Failed to fetch` observed before fix | `/tmp/kimi-network-red.log` |
| Final unit suite | 31 passed | `/tmp/kimi-unit-final.log` |
| Final browser suite | 28 passed in 17.9s | `/tmp/kimi-browser-final.log` |
| Repeat axe regression | 3 passed | Repeated `tests/stream-ui.spec.ts` error-state test |
| ESLint | Passed | `npm run lint` |
| Route generation | Passed | `/tmp/next-typegen.log` |
| Strict TypeScript | Passed, no diagnostics | `/tmp/tsc.log` |
| Production build | Passed, Next.js 16.3.4 | `/tmp/build.log` |
| Managed production runtime | Build/start/health passed | `build_and_start` result; preview URL below |
| Schema application | Migration applied and actual tables/journal queried through Drizzle | `chat_sessions`, `conversations`; migration hash `d5d43cb5584e4ff11d5997596a991d6effe065e32c92741f4adad4fe4820bf8e` |
| Test data cleanup | Zero local conversations after fixtures | Drizzle count query |
| Production dependency audit | Zero vulnerabilities | `npm audit --omit=dev` |
| Credential-pattern scan | No matches in src/tests/scripts/drizzle | Pattern scan returned no filenames; not a complete secret-scanner certification |
| Desktop/mobile capture | HTTP 200; 390px viewport/document width both 390 | `artifacts/workspace-desktop.png`, `workspace-mobile.png`, `workspace-settings.png` |
| Original live suite | 12 passed | `/tmp/kimi-live-rerun.log` |
| Strengthened live test | Provider test failed with raw network banner; no successful full-answer persistence assertion | `/tmp/kimi-live-final-artifacts/.../error-context.md` |

Chromium initially lacked `libnspr4.so`; system dependencies were installed and the browser rerun. An early pair of concurrent Playwright processes collided in their shared artifact folder; subsequent runs were sequential or used separate output paths. These were harness failures, not product findings. Node's strip-types module-format warning remains informational; it did not prevent tests from executing. Traces from the live run are not copied into user-facing artifacts because they may contain session cookies.

## Pre-mortem and rollout boundaries

- **Malicious/malformed input:** server schemas/body limits/owner checks and existing tests retained; same-origin writes and cookie flags exercised. This was not an exhaustive penetration test.
- **Concurrency:** database lease and delete lock retained; original stop-click send-latch behavior preserved. Broad concurrent load, lease-expiry fault injection and new-conversation idempotency tokens remain untested/out of scope.
- **Partial networks:** stop, malformed streams, failed API contracts and connection reset covered; explicit retry avoids automatic duplicate billing. Live transport reliability remains open (H2).
- **Empty/expired data:** empty history, failed loading and missing-key draft preservation exercised. Cookie loss intentionally loses workspace access; no recovery/SSO/RBAC is implemented.
- **Scale:** bounded workspace/history and parser sizes retained. No scale/latency certification; large JSONB histories need a separate indexing/normalization/performance project.
- **Retention:** idle means last generation, not read activity. Review policy and backups before scheduling the retained pruning CLI. No cron or destructive production operation was run.
- **Secrets:** reference docs report historical SSH/provider exposure. Actual rotations need operator confirmation; deleting material locally cannot revoke exposed secrets.
- **Provider:** preview has no NVIDIA key. Local streaming tests are explicitly fixture-driven; image upload validation/lightbox are tested but live image inference is not verified.
- **Accessibility:** automated Chromium/axe checks and mobile focus tests passed; screen-reader, Firefox/WebKit and broader zoom/input-device validation remain required.

Preview: https://3000-iwkqxwm93z4dgb09gx07c.e2b.app

This is a tested, improved chat starter with explicit deployment boundaries, not a claim of enterprise certification. The live website was reviewed and tested, not redeployed.
