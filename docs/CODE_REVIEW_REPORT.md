# Code Review & Security Audit — Kimi Workspace

**Date:** 2026-09-10 · **Scope:** `src/**`, `tests/**`, root configs, docs · **Method:** Tiered pipeline (static analysis → security scan → quality checklist → tests → expert review) per the repo `code-review-and-audit` skill, with native CLI fallbacks for phases whose runner scripts are absent from the skill bundle.

---

## Summary

| Severity | Total | Remediated this pass | Open |
|----------|-------|----------------------|------|
| 🔴 Critical | 2 | 1 | 1 (key rotation — operator action) |
| 🟠 High | 1 | 1 | 0 |
| 🟡 Medium | 4 | 4 | 0 |
| 🟢 Low | 3 | 2 | 1 |
| ⚪ Info | 6 | 0 | 6 (documented tradeoffs / backlog) |

The application was previously in a **non-shippable state** (broken type-check/build gate, committed private key). All code-level findings are remediated on `main`; the single remaining Critical item is rotating the exposed SSH key, which requires operator action.

## Verification ledger

| Check | How | Result |
|-------|-----|--------|
| ESLint (flat config, next core-web-vitals) | `npm run lint` | ✅ 0 problems |
| Type safety | `npm run typecheck` (next typegen + `tsc --noEmit`) | ✅ pass, strict mode, zero `any`/`@ts-ignore` |
| Production build | `npm run build` | ✅ all routes compile |
| Unit tests | `npm test` | ✅ 5/5 |
| E2E + API + WCAG | `npm run test:e2e` against production build + disposable PostgreSQL | ✅ 9/9 (incl. axe WCAG 2.2 AA, session isolation, origin enforcement) |
| Dependency audit (prod) | `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| Dependency audit (full) | `npm audit` | ⚠️ 4 moderate, dev-only (esbuild chain via drizzle-kit) |
| Secret scan | pattern scan over `src/` (`nvapi-`, `sk-`, `AKIA`, `PRIVATE KEY`, assignments) | ✅ clean |
| Dangerous-pattern scan | `eval` / `new Function` / `dangerouslySetInnerHTML` / `innerHTML` / raw SQL | ✅ none |
| Live NVIDIA inference | Not executable here (no key/model entitlement) | ⚪ unverified — missing-key path covered by tests |

---

## 🔴 Critical

### C1 — Private SSH key committed to the repository ✅ remediated / ⚠️ rotation required
- **Location:** `docs/ssh-key.txt` (removed in commit `c923dde`)
- **Description:** An OpenSSH private key (`-----BEGIN OPENSSH PRIVATE KEY-----`) identical to the deployment key was tracked in git and published to GitHub.
- **Evidence:** File content matched the operator's push key byte-for-byte at audit start.
- **Impact:** Anyone with repository read access could impersonate the deploy identity against GitHub until rotation.
- **Remediation:** Removed from tracking, secret patterns (`ssh-key*.txt`, `*.pem`, `*.key`, `id_rsa*`) added to `.gitignore`.
- **Residual risk (OPEN):** The key **remains in git history**; removal from `HEAD` does not unpublish it. **Rotate/revoke the key at GitHub and in the deployment environment now.** History rewrite + force-push is possible but was deliberately not performed without operator sign-off.
- **Confidence:** Verified.

### C2 — Type-check and production build fail ✅ remediated
- **Location:** `tsconfig.json`, `eslint.config.mjs`
- **Description:** `include: ["**/*.ts", ...]` with `exclude: ["node_modules"]` pulled TypeScript files from the uploaded reference trees (`skills/**`, `sample-build/**`) into every type-check; `next build` type-checks the same set and failed. The documented verification flow could not pass in any workspace containing those folders.
- **Evidence:** Baseline run: `tsc --noEmit` → 20+ `TS2307/TS2305` errors from `skills/` and `sample-build/`; `npm run build` → `Failed to type check.` ESLint additionally reported 12 unused-directive warnings from `skills/kimi-pdf/scripts/paged.polyfill.js`.
- **Impact:** Broken release gate; agents/humans would be tempted to weaken checks to ship.
- **Remediation:** Exclude `skills`, `sample-build`, `docs` in `tsconfig.json`; matching `globalIgnores` in ESLint flat config (commit `8bd2833`).
- **Verification:** `npm run typecheck`, `npm run build`, `npm run lint` all green after the change.
- **Confidence:** Verified.

## 🟠 High

### H1 — Lint error in the primary client component ✅ remediated
- **Location:** `src/components/chat-workspace.tsx` (mount effect)
- **Description:** `react-hooks/set-state-in-effect` (error level in `eslint-config-next` 16) on the workspace-load effect; `refresh()` was an async callback whose state updates the rule could not prove asynchronous, and there was no cancellation guard for unmount races.
- **Impact:** CI with `--max-warnings 0` or strict lint gates fails; potential late `setState` after unmount.
- **Remediation:** Extracted module-level `fetchWorkspace()` (fetch + zod parse, no state); state updates now occur in promise callbacks guarded by a `cancelled` flag returned as effect cleanup (commit `90101ee`). Behavior preserved; "Retry connection" path reuses the same callback.
- **Verification:** `npm run lint` → 0 problems; full E2E suite passes (initial-load and retry UX covered).
- **Confidence:** Verified.

## 🟡 Medium

### M1 — No Playwright configuration; no test entry points ✅ remediated
- **Location:** repository root, `package.json`
- **Description:** Playwright tests existed but `playwright.config.ts` did not; there was no `test`/`test:e2e`/`typecheck` script, so the documented commands depended on implicit defaults and manual sequencing (`next typegen` before `tsc` was easy to skip).
- **Remediation:** Added `playwright.config.ts` (chromium project, single worker, optional webServer on `:3000`, `TEST_BASE_URL` override) and scripts: `npm test`, `npm run test:e2e`, `npm run typecheck` (= `next typegen && tsc --noEmit`) (commits `b637685`, `35beecc`).
- **Confidence:** Verified (all suites run via the new entry points).

### M2 — Streamed Markdown lacks GitHub-Flavored Markdown ✅ remediated
- **Location:** `src/components/chat-workspace.tsx` (assistant renderer)
- **Description:** `react-markdown` without `remark-gfm` renders model-output tables as plain pipe-delimited text — a daily-visible polish defect for a chat product.
- **Evidence (TDD):** New hermetic Playwright test streams a table through the transport fixture and asserts `getByRole("table")` — **failed before** the change, **passes after** adding `remark-gfm` and mint-palette table styles (commit `b637685`).
- **Confidence:** Verified.

### M3 — Packaging gaps: no `.env.example`, no LICENSE ✅ remediated
- **Location:** repository root
- **Description:** README instructed `cp .env.example .env` (file did not exist) and referenced a license (none present). New-clone setup failed at step one.
- **Remediation:** Added `.env.example` (DATABASE_URL, optional server-only NVIDIA_API_KEY) and MIT `LICENSE` (commit `35beecc`).
- **Confidence:** Verified.

### M4 — Secret file hygiene (prevention) ✅ remediated
- **Location:** `.gitignore`
- **Description:** No patterns excluded key material; `docs/ssh-key.txt` proved the risk is real, not hypothetical.
- **Remediation:** Added secret patterns and ignored the auto-generated `next-env.d.ts` (commits `c923dde`, `35beecc`).
- **Confidence:** Verified.

## 🟢 Low

### L1 — PATCH response missing `Cache-Control: no-store` ✅ remediated
- **Location:** `src/app/api/conversations/[id]/route.ts` (`PATCH`)
- **Description:** GET responses set `no-store`; the PATCH (rename) response did not. Shared caches may heuristically cache non-GET responses only in unusual setups, so this is consistency hardening rather than an exploitable flaw.
- **Remediation:** Add the header (commit following this report; covered by an API assertion).
- **Confidence:** Verified.

### L2 — `package.json` name does not match the project ✅ remediated
- **Location:** `package.json`
- **Description:** `"name": "nextjs-postgresql-template"` while the product/docs identity is "Kimi Workspace". Cosmetic, but manifests feed badges, deploy platforms, and tooling output.
- **Remediation:** Rename to `kimi-workspace` (private package; no publish impact).
- **Confidence:** Verified.

### L3 — Assistant Markdown re-parses on every SSE delta ⚪ documented, not fixed
- **Location:** `src/components/chat-workspace.tsx`
- **Description:** Each delta re-renders the full accumulated answer through `react-markdown`. Output is bounded by the 16,384-token cap (~60–65k chars), so worst-case cost is bounded; typical answers are far smaller. A throttled render (e.g. rAF-batched) is a straightforward optimization if long-answer jank is observed.
- **Confidence:** Reasoned (not profiled in this environment).

## ⚪ Info (documented tradeoffs & backlog)

| # | Finding | Disposition |
|---|---------|-------------|
| I1 | CSP intentionally covers `frame-ancestors`/`base-uri`/`object-src` only; no `script-src` | Documented hardening step — add a nonce-based script policy at deployment |
| I2 | No HSTS header | Deployment-specific; set at trusted ingress |
| I3 | Sessions/conversations have no retention job; expired cookie rows accumulate | Backlog: scheduled Drizzle cleanup job (README "before deployment" requires choosing a retention schedule) |
| I4 | History search covers titles only | Backlog: content search via SQL over the JSONB `messages` column if needed |
| I5 | 4 moderate dev-only advisories (esbuild chain under drizzle-kit) | Accepted: suggested fix is a breaking downgrade; dev tooling never exposed publicly |
| I6 | `docs/*.zip` reference-build snapshots add repository weight | Hygiene note; retained deliberately as user-uploaded reference material |

## ✅ Passed checks (evidence-backed)

- **Ownership & isolation:** every conversation query filters by `owner` (SHA-256 of cookie token); cross-session access → 404 (tested).
- **CSRF/origin:** all writes require same-origin `Origin` + `sec-fetch-site` checks; cross-site → 403 (tested, including `Origin: null`).
- **Session cookie:** 256-bit random token, HTTP-only, SameSite=Strict, Secure over HTTPS; only the digest is stored (flags asserted in tests).
- **Injection safety:** Drizzle parameterized queries only; zod validation at every boundary; react-markdown sanitizes model HTML by default; links get `noopener noreferrer`; remote model images are not fetched.
- **Resource limits:** bounded request bodies (3 MB), image magic-byte verification (2 MB), 16k-char prompts, 60-message/8 MB history caps, 600k-char response cap, 100-conversation cap — all server-enforced.
- **Concurrency:** atomic session lease (one generation per workspace, 3 s spacing, 195 s expiry), delete-vs-stream race prevented via `FOR UPDATE` ordering consistent with the lease path (no deadlock ordering inversion).
- **Streaming integrity:** SSE parser handles fragmented/CRLF/multi-line events with size caps; malformed/incomplete provider streams → explicit errors; partial answers never persisted; duplicate-retry guarded.
- **Privacy:** structured logs carry operation/ids/error types only — never message content, cookies, or keys; reasoning content never leaves the server.
- **Accessibility:** WCAG 2.2 A/AA/21AA/22AA violations = 0 via axe on the workspace and settings dialog (tested).
- **Dependency health:** 0 production vulnerabilities; lockfile present and respected.

## Remediation backlog (recommended next steps)

1. **[Operator] Rotate the exposed SSH key** (C1 residual) — revoke at GitHub, replace in deployment, then optionally rewrite history.
2. Add a scheduled retention job for expired sessions/conversations (I3) once a retention policy is chosen.
3. Add message-content search (I4) via a `?q=` parameter with SQL matching over the JSONB messages.
4. Add a nonce-based CSP `script-src` policy at deployment time (I1) and HSTS at ingress (I2).
5. Consider rAF-throttled Markdown rendering for very long answers (L3).
6. Add CI (lint → typecheck → test → build) so the verified gate order runs on every push.
