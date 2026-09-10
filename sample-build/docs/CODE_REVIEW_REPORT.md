# Code Review & Security Audit — Kimi Workspace

**Date:** 2026-09-10 · **Pass 2** · **Scope:** `src/**`, `tests/**`, root configs, docs, live deployment (`https://kimi-chat.jesspete.shop/`) · **Method:** Tiered pipeline per the repo `code-review-and-audit` skill — static gates (lint/typecheck), OWASP-oriented security scan (native CLI fallback), 12-category quality checklist, full unit + E2E suites, Lighthouse, live-site browser E2E (new `tests/live-site.spec.ts`), expert manual review, and external verification of the NVIDIA provider contract against `build.nvidia.com` documentation.

Pass 1 (same file, 2026-09-10) remediated the original non-shippable state: committed SSH key removed from tracking (C1/C2), broken type-check/build gates repaired (C2), lint error in the client component (H1), Playwright tooling gaps (M1), GFM rendering (M2), packaging gaps (M3), secret-pattern hygiene (M4), PATCH cache header (L1), package name (L2).

---

## Summary

| Severity | Total this pass | Remediated this pass | Open after pass |
|----------|-----------------|----------------------|-----------------|
| 🔴 Critical | 1 | 0 | 1 (key rotation — operator action) |
| 🟠 High | 3 | 3 | 0 code / 1 deployment incident (operator) |
| 🟡 Medium | 3 | 3 | 0 |
| 🟢 Low | 2 | 2 | 0 |
| ⚪ Info | 6 | 1 (CI) | 5 (documented tradeoffs) |

The application code is **shippable** after this pass's remediations. The one blocking operational issue is environmental: the current live deployment cannot reach its PostgreSQL database, which no code change in this repository can repair.

## Verification ledger

| Check | How | Result |
|-------|-----|--------|
| ESLint (flat config) | `npm run lint` | ✅ 0 problems |
| Type safety | `npm run typecheck` (`next typegen` + `tsc --noEmit`, strict, zero `any`/`@ts-ignore`) | ✅ pass |
| Production build | `npm run build` | ✅ 6 routes compile |
| Unit tests | `npm test` | ✅ 5/5 |
| E2E + API + WCAG (local) | `npx playwright test` against production build + disposable PostgreSQL 18 (embedded) | ✅ 9/9 |
| Live-site E2E | `LIVE_SITE_URL=https://kimi-chat.jesspete.shop npx playwright test tests/live-site.spec.ts` | ⚠️ 7 passed / 4 failed / 1 skipped — failures drive findings H1, H2, H3 below |
| Dependency audit (prod) | `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| Dependency audit (full) | `npm audit` | ⚠️ 4 moderate, dev-only (esbuild chain via drizzle-kit) — unchanged from pass 1 |
| Secret scan | `nvapi-`, `sk-`, `AKIA`, `PRIVATE KEY`, `ghp_` patterns over `src/`, `tests/`, root configs | ✅ clean |
| Dangerous-pattern scan | `eval` / `new Function` / `dangerouslySetInnerHTML` / `innerHTML` / `document.write` / `console.log` / `NEXT_PUBLIC_` | ✅ none |
| SQL injection surface | all queries Drizzle-parameterized; only template literals are aggregates/bound values | ✅ clean |
| Security headers on prod build | `curl -I` local production server | ✅ nosniff, DENY, Referrer-Policy, Permissions-Policy, CSP (`frame-ancestors 'none'; base-uri 'self'; object-src 'none'`), `Cache-Control: no-store` on data APIs; session cookie HttpOnly + SameSite=Strict |
| Contract paths exercised | missing key → 503 with guidance copy; oversized body → 413; cross-origin chat → 403; bad UUID → 400; session cookie flags | ✅ all as documented |
| Lighthouse (local prod, welcome state) | Performance 90 · Accessibility 100 · Best Practices 96 | ✅ (a11y score applies to the scanned state; see H1/H3 for the error state) |
| NVIDIA provider contract | `build.nvidia.com/moonshotai/kimi-k3` + `docs.api.nvidia.com` (checked 2026-09): model id `moonshotai/kimi-k3`, `https://integrate.api.nvidia.com/v1/chat/completions` with `Accept: text/event-stream`, `reasoning_effort` enum `low/high/max` (default `max`), multimodal `image_url` content blocks | ✅ matches implementation; `reasoning_content` in stream deltas is implied by NVIDIA's sample code though not in the published delta schema — the app's `.nullish()` parsing already tolerates both shapes |
| Live NVIDIA inference | Not executable (no key/model entitlement in this environment) | ⚪ unverified — missing-key path covered by tests |

---

## 🔴 Critical

### C1 — Exposed SSH private key must be rotated ⚠️ OPEN (operator action)
- **Location:** git history (`docs/ssh-key.txt`, removed from `HEAD` in pass 1)
- **Description:** The deployment key published to GitHub in pass 1 remains valid until revoked. Removal from tracking does not unpublish history. Additionally the operator re-supplies this same key for push automation, confirming it is still active.
- **Impact:** Repository read access = push access to the deployment identity until rotation.
- **Required action:** Revoke/rotate the key at GitHub and in the deployment environment. History rewrite remains deliberately deferred without operator sign-off.
- **Confidence:** Verified (key material present in git history; operator reuses the same credential).

## 🟠 High

### H1 — Error-banner text fails WCAG AA contrast ✅ remediated
- **Location:** `src/app/globals.css` `.error-banner` (`color: #887349` on `background: #fffaf0`; `.error-banner .icon-button` `color: #a28c61`)
- **Description:** Banner text measures 4.39:1 (icon 3.12:1) against the required 4.5:1 for 11px normal-weight text. Verified three ways: live axe run (`color-contrast`, impact `serious`), local recomputation (4.39:1), and reproduced on the local build by forcing the error state.
- **Evidence:** Live E2E failure — the deployed database outage makes the banner visible on load, and the axe scan fails with 58 contrast findings rooted in this rule pair.
- **Impact:** The error state — the moment clarity matters most — is the least accessible state in the app; automated WCAG claims did not hold for it.
- **Remediation:** Darken to `#6f5c30` (6.21:1) for text and `#7d673a` (5.21:1) for the dismiss icon; palette character preserved. Covered by a new regression test (H3).
- **Confidence:** Verified (before/after axe + contrast math).

### H2 — Live deployment database unreachable ⚠️ OPEN (operator/environment)
- **Location:** deployment environment (`DATABASE_URL`) at `https://kimi-chat.jesspete.shop/`
- **Description:** `/api/health` → 500 `{ok:false}` and `/api/conversations` → 500 with structured error + requestId. The static UI renders (welcome, starters, settings dialogs all pass live), but every persistence/session call fails, so the workspace cannot create sessions or conversations. The deployment serves the current build (CSS hash and palette match the repo), isolating the fault to the database dependency, not the release.
- **Evidence:** `curl https://kimi-chat.jesspete.shop/api/health` → HTTP 500; browser E2E observed the same; identical requests against the local production build + disposable PostgreSQL return 200.
- **Impact:** Live service is functionally down for its core purpose (saved conversations); provider streaming also untestable because the `configured` flag cannot be served.
- **Remediation:** Restore PostgreSQL reachability for the deployed `DATABASE_URL` (instance stopped, credentials rotated/expired, or networking/firewall). `/api/health` is the correct probe. README troubleshooting gains a runbook row (L2).
- **Confidence:** Verified (remote 500 vs local 200 on identical code).

### H3 — WCAG suite never scans the error state (test gap enabling H1) ✅ remediated
- **Location:** `tests/workspace.spec.ts` (axe coverage), `tests/live-site.spec.ts`
- **Description:** Automated accessibility checks covered the welcome state and settings dialog only. The H1 violation shipped precisely because the error banner never renders during a healthy scan.
- **Remediation (TDD):** New hermetic test routes `/api/conversations` to a 500 so the banner renders, then asserts zero serious axe violations — **failed before** the palette fix (serious `color-contrast`), **passes after**. The live-site suite now scans the error state too when the deployment is degraded.
- **Confidence:** Verified (red → green observed).

## 🟡 Medium

### M1 — Non-JSON API failures leak raw parse errors into the UI ✅ remediated
- **Location:** `src/components/chat-workspace.tsx` (`apiJson`, `fetchWorkspace`, `openConversation`)
- **Description:** `await response.json()` inside `apiJson` throws a raw `SyntaxError` (e.g. `Unexpected token '<' …`) when an ingress/proxy answers with an HTML 502 page; likewise a 2xx body that fails the zod contract throws a multi-line `ZodError` whose message lands verbatim in the error banner.
- **Impact:** Confusing, potentially information-leaking client copy during exactly the degraded-infra scenarios where users need guidance.
- **Remediation (TDD):** `apiJson` now tolerates non-JSON bodies (falls back to the curated "The request failed. Please try again." copy); `fetchWorkspace`/`openConversation` wrap contract parsing and throw the friendly reload copy on schema mismatch. Regression test mocks an HTML 502 from `/api/conversations` and asserts the banner shows the friendly copy and never `Unexpected token`.
- **Confidence:** Verified (red → green observed).

### M2 — History search covers titles only (pass 1 backlog I4) ✅ remediated
- **Location:** `src/app/api/conversations/route.ts`, `src/components/chat-workspace.tsx` (search dialog)
- **Description:** `⌘K` filtered the already-loaded 100 titles client-side; message content was unsearchable. Documented as backlog item I4 in pass 1.
- **Remediation (TDD):** `GET /api/conversations?q=term` now filters server-side by owner with case-insensitive matching over `title` **and** message content (`jsonb_array_elements_text` over the JSONB messages, ILIKE with escaped wildcards, fully parameterized). The search dialog debounces 250 ms and queries the server for non-empty terms, with an in-flight guard; empty terms restore the local list. API + UI tests added (ownership isolation of results asserted).
- **Confidence:** Verified (new tests red → green against embedded PostgreSQL).

### M3 — No retention path for expired sessions/conversations (pass 1 backlog I3) ✅ remediated
- **Location:** repository scripts + `package.json`
- **Description:** Cookie expiry does not delete database rows; pass 1 required "a reviewed Drizzle job" but none existed. Idle `chat_sessions` rows (and conversations cascaded to them) accumulate indefinitely.
- **Remediation (TDD):** `src/lib/retention.ts` exposes `pruneIdleSessions(db, {idleDays})` (deletes sessions whose `lastRequest` predates the cutoff; conversations cascade) and `pruneStaleConversations(db, {olderThanDays})` (opt-in via flag). `scripts/prune-expired.ts` is a thin CLI wrapper exposed as `npm run prune -- --idle-days 30 [--conversation-days 90]`. Integration test in `tests/workspace.spec.ts` seeds old/new fixtures, runs the pruning functions, and asserts exact deletion semantics (never-used sessions with `lastRequest = epoch` are pruned; active sessions survive).
- **Confidence:** Verified (test red → green against embedded PostgreSQL).

## 🟢 Low

### L1 — No HSTS header ✅ remediated
- **Location:** `next.config.ts` headers
- **Description:** HSTS was listed as ingress-specific in pass 1; adding `Strict-Transport-Security: max-age=63072000; includeSubDomains` at the app layer is safe (ignored over plain HTTP, enforced by TLS ingress) and removes one deployment omission. (`preload` deliberately omitted so domains are not committed to the HSTS preload list without operator intent.)
- **Confidence:** Verified (header asserted in live-site suite + curl).

### L2 — README troubleshooting lacks a database-outage runbook row ✅ remediated
- **Location:** `README.md` troubleshooting table
- **Description:** H2 showed operators need the "health returns `ok:false` → check `DATABASE_URL`/Postgres reachability; UI renders but persistence fails" path spelled out.
- **Confidence:** Verified (docs updated to match observed failure modes).

## ⚪ Info (documented tradeoffs & backlog)

| # | Finding | Disposition |
|---|---------|-------------|
| I1 | CSP intentionally covers `frame-ancestors`/`base-uri`/`object-src` only; no nonce-based `script-src` | Unchanged — deployment-specific hardening step; adding `unsafe-inline` would weaken rather than harden |
| I2 | Multi-model catalog and multi-image attachments exist in `sample-build/` (Nova reference) | Deliberately **not** adopted: the documented product contract pins `moonshotai/kimi-k3` and one image per message; expanding scope would invalidate the docs/contract alignment this pass proves. Recorded as future feature work |
| I3 | CI now added: `.github/workflows/ci.yml` runs install → typecheck → lint → unit → build, plus an E2E job with a PostgreSQL service container | Implemented this pass (pass 1 backlog #6) |
| I4 | `reasoningEffort` select casts via `as` in the settings dialog | Accepted — options are a fixed, validated set; zod re-validates server-side |
| I5 | `crypto.randomUUID()` in the client requires a secure context | Satisfied by the documented HTTPS-ingress deployment requirement |
| I6 | 4 moderate dev-only advisories (esbuild chain under drizzle-kit) | Accepted, unchanged: suggested fix is a breaking downgrade; dev tooling is never exposed publicly |
| I7 | Streaming Markdown re-parses per delta (pass 1 L3) | Deferred with rationale — bounded by the 16,384-token cap; revisit only if long-answer jank is profiled |

## ✅ Passed checks (evidence-backed)

- **Ownership & isolation:** every conversation query filters by `owner` (SHA-256 of cookie token); cross-session access → 404 (tested locally and re-verified live via independent cookies).
- **CSRF/origin:** all writes require same-origin `Origin` + `sec-fetch-site` checks; cross-site → 403 (tested locally, re-verified live).
- **Session cookie:** 256-bit random token, HTTP-only, SameSite=Strict, Secure over HTTPS; only the digest is stored (flags asserted in tests, observed live via `Set-Cookie`).
- **Injection safety:** Drizzle parameterized queries only (including the new search path); zod validation at every boundary; react-markdown sanitizes model HTML by default; links get `noopener noreferrer`; remote model images are not fetched.
- **Resource limits:** bounded request bodies (3 MB — 413 observed), image magic-byte verification (2 MB), 16k-char prompts, 60-message/8 MB history caps, 600k-char response cap, 100-conversation cap — all server-enforced.
- **Concurrency:** atomic session lease (one generation per workspace, 3 s spacing, 195 s expiry), delete-vs-stream race prevented via `FOR UPDATE` ordering consistent with the lease path.
- **Streaming integrity:** SSE parser handles fragmented/CRLF/multi-line events with size caps; malformed/incomplete provider streams → explicit errors; partial answers never persisted; duplicate-retry guarded.
- **Privacy:** structured logs carry operation/ids/error types only; reasoning content never leaves the server; no `console.log`; no secret patterns anywhere in app code.
- **Provider contract:** implementation matches NVIDIA's published kimi-k3 schema (model id, endpoint, `reasoning_effort` enum including the NIM-specific `max`, multimodal `image_url` blocks).
- **Docs/code alignment:** every limit, header, status code, and flow claim in `AGENTS.md`/`CLAUDE.md`/`README.md` was re-checked against the code this pass; docs updated where remediation changed behavior (search, retention, CI, HSTS, live-site suite).

## Remediation backlog (recommended next steps)

1. **[Operator] Rotate the exposed SSH key** (C1) — revoke at GitHub, replace in deployment, then optionally rewrite history.
2. **[Operator] Restore the deployed `DATABASE_URL`** (H2) — verify with `/api/health` returning `{"ok":true}`, then re-run the live-site suite: `LIVE_SITE_URL=https://kimi-chat.jesspete.shop npx playwright test tests/live-site.spec.ts`.
3. Schedule `npm run prune` (M3) per the retention policy the operator chooses (e.g. weekly cron).
4. Add a nonce-based CSP `script-src` policy at deployment time (I1).
5. Revisit rAF/`useDeferredValue` Markdown rendering if long-answer jank is profiled (I7).
6. After key rotation, decide on history rewrite (C1) with operator sign-off.
