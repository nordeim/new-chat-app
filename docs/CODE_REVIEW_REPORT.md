# Code Review & Security Audit — Kimi Workspace

**Date:** 2026-09-10 · **Pass 3** · **Scope:** `src/**`, `tests/**`, root configs, CI, docs, and the live deployment (`https://kimi-chat.jesspete.shop/`) · **Method:** Tiered pipeline per the repo `code-review-and-audit` skill (native CLI fallback mode): static gates, OWASP-oriented security scan, secret scan, dependency audit, 12-category quality matrix, full unit + E2E suites, live-site browser E2E, contract re-verification of every AGENTS/CLAUDE/README claim against the code, and expert manual review across correctness, security, data integrity, error handling, performance, testing, maintainability, consistency, and dependency health.

Pass 2 (same file) remediated the pass-1 findings and left two operator items open. This pass began from a fresh clone, validated the documented state, ran browser E2E against the live deployment, then remediated what it found with red→green tests. All code remediations below landed in this pass's commits.

> **Addendum 2026-09-10 (272d7ff):** Post-pass audit of `HEAD` (`eb654aa`) revealed `dc1c664`'s claim “`.env` untracked” never took effect — `git ls-tree` still showed `.env` tracked and `git grep` hit `nvapi-` in it. Remediated here by `git rm --cached .env` (file stays locally, `.gitignore` now effective); CI secret scan no longer hits `.env` in tracked files. Rotate the provider key — history still retains `7afe083` and this key. See `kimi-workspace-review-validation-plan.md` Live Validation Evidence.

---

## Summary

| Severity | Found this pass | Remediated this pass | Open after pass |
|----------|-----------------|----------------------|-----------------|
| 🔴 Critical | 2 | 1 (code) / 1 partial | 2 operator rotations (SSH key carried; NVIDIA key rotation advised — key reads as dead) |
| 🟠 High | 2 | 2 (code) | 0 code / redeploy required to take effect live |
| 🟡 Medium | 1 | 1 | 0 |
| 🟢 Low | 2 | 2 | 0 |
| ⚪ Info | 6 | 0 | 6 (documented tradeoffs / operator schedule items) |

The application code is **shippable** after this pass's remediations, with one deployment dependency: the proxy-aware same-origin fix only protects users after the operator redeploys the production build.

## Verification ledger

| Check | How | Result |
|-------|-----|--------|
| Type safety | `npm run typecheck` (`next typegen` + `tsc --noEmit`, strict, zero `any`/`@ts-ignore`) | ✅ pass |
| Lint | `npm run lint` (flat config, next core-web-vitals) | ✅ 0 problems |
| Unit tests | `npm test` (node:test + strip-types) | ✅ 15/15 (5 existing + 7 new origin + 3 new/expanded SSE cases) |
| Production build | `npm run build` | ✅ 6 routes compile |
| Local E2E + API + WCAG | `npx playwright test tests/workspace.spec.ts tests/stream-ui.spec.ts` against production build + disposable embedded PostgreSQL 18 | ✅ 16/16 (2 new: proxied-origin, mobile-nav Escape) |
| Live-site E2E | `LIVE_SITE_URL=https://kimi-chat.jesspete.shop npx playwright test tests/live-site.spec.ts` (pre-fix build) | ⚠️ 11/12 — the streaming failure exposed H1 (403) and M1 (false-positive race); suite hardened, rerun required after redeploy |
| Live deployment health | `curl https://kimi-chat.jesspete.shop/api/health` | ✅ `{"ok":true}` — pass-2 H2 (database unreachable) is **resolved** by the operator |
| Live headers & cookie | `curl -sI` + browser context | ✅ nosniff, DENY, HSTS `max-age=63072000; includeSubDomains`, Referrer-Policy, Permissions-Policy, CSP `frame-ancestors 'none'; base-uri 'self'; object-src 'none'`; `kimi_session` HttpOnly + SameSite=strict + Secure |
| Provider streaming round-trip | Local production build + real provider call (`max_tokens 256`, effort `low`) | ✅ SSE contract exercised end-to-end: `meta` → provider fetch → structured `error` event with curated copy → lease released. **The repo's leaked key is rejected by NVIDIA (HTTP 403 "Authorization failed")** — verified directly against `integrate.api.nvidia.com`, so a full streamed answer could not be produced in this environment |
| Secret scan | `git grep -IE 'nvapi-…\|BEGIN …PRIVATE KEY…\|ghp_…\|AKIA…'` over app code (`src tests scripts drizzle` + root configs) | ✅ clean (after remediation); reference material (`skills/`, `sample-build/`, `docs/`) deliberately out of app-code scan scope, embedded doc key redacted |
| Dangerous patterns | grep for `eval` / `new Function` / `dangerouslySetInnerHTML` / `innerHTML` / `document.write` / `console.log` / `NEXT_PUBLIC_` over `src/` | ✅ none |
| Dependency audit (prod) | `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| Dependency audit (full) | `npm audit` | ⚠️ 4 moderate, dev-only (esbuild chain via drizzle-kit) — unchanged from pass 2; suggested fix remains a breaking downgrade |
| SQL injection surface | all queries Drizzle-parameterized; the JSONB search template binds `searchPattern()` output (wildcards escaped) | ✅ clean |
| Security headers on prod build | `curl -I` local production server | ✅ full set present, `Cache-Control: no-store` on data APIs |
| Contract paths exercised | missing key → 503 curated copy; oversized body → 413; cross-origin chat → 403; bad UUID → 400; provider 401/403 → 502 curated copy; invalid JSON → 400 | ✅ all as documented |
| NVIDIA provider contract | model id `moonshotai/kimi-k3`, `https://integrate.api.nvidia.com/v1/chat/completions`, `Accept: text/event-stream`, `reasoning_effort` enum, `image_url` blocks | ✅ matches implementation and build.nvidia.com docs |

---

## 🔴 Critical

### C1 — Exposed SSH private key must be rotated ⚠️ OPEN (operator action, carried from pass 1/2)
- **Location:** git history (`docs/ssh-key.txt`, untracked since pass 1); the operator continues to supply the same credential for push automation.
- **Impact:** Repository read access = push access to the deployment identity until rotation.
- **Required action:** Revoke/rotate at GitHub and in the deployment environment; then decide on history rewrite with operator sign-off.
- **Confidence:** Verified (credential reuse observed in this pass's workflow).

### C2 — Live NVIDIA API key committed and tracked in `.env` ✅ remediated this pass / rotation advised
- **Location:** `.env` (added in commit `7afe083`, tracked at HEAD until this pass); a second key embedded in `docs/prompt-to-create.md`.
- **Description:** `.gitignore` listed `.env`, but the file had been force-added and remained tracked, so the ignore rule never applied. The key was public on GitHub. Consequence observed in testing: the tracked key also broke the documented E2E precondition ("no `NVIDIA_API_KEY`"), failing the missing-key UX test locally.
- **Evidence:** `git ls-files` lists `.env`; `git check-ignore` does not suppress tracked files. Direct probe of the provider returned HTTP 403 "Authorization failed" for the key, so it reads as revoked/expired — the immediate abuse risk is limited, but rotation remains the correct closure because exposure cannot be undone from history.
- **Remediation this pass:** `git rm --cached .env` (kept locally for dev; ignore rule now effective); redacted the second key in `docs/prompt-to-create.md`; added a credential-pattern scan and a production-only `npm audit` gate to CI.
- **Confidence:** Verified.

## 🟠 High

### H1 — Same-origin writes rejected on the live deployment (chat broken in production) ✅ remediated (code) — redeploy required
- **Location:** `src/lib/server.ts` `assertOrigin` (now `src/lib/origin.ts` + thin wrapper).
- **Description:** `assertOrigin` compared the `Origin` host only against the `Host` header. The live ingress (Cloudflare) rewrites `Host` to the upstream value while still forwarding `x-forwarded-proto` (proven by the `Secure` cookie flag), so every legitimate same-origin browser `POST /api/chat` — and PATCH/DELETE — failed with 403 "This action must be made from your chat workspace." The static UI worked; the core action did not.
- **Evidence:** Browser E2E on the live site captured the 403 banner after send; `curl -X POST` with a perfectly matching `Origin: https://kimi-chat.jesspete.shop` reproduced the 403; identical request against the local production build returned the expected stream/503 path.
- **Remediation (TDD):** Extracted a pure `isSameOriginRequest(origin, host, forwardedHost, secFetchSite)` into `src/lib/origin.ts`; 7 unit tests (red→green) cover proxied matches, chained `x-forwarded-host`, malformed origins, non-http(s) schemes, and cross-site rejection. An API regression test drives the full request path with rewritten-Host headers (expects 400-not-403) and asserts mismatched origins stay rejected.
- **Security envelope unchanged:** a direct (non-browser) attacker could always spoof `Host`, so the comparison target was never a CSRF boundary; browsers cannot forge `Origin` or `sec-fetch-site`, and cross-site origins match neither `Host` nor the trusted ingress's `x-forwarded-host`. Deployment requirement (trusted ingress, public host preserved in `x-forwarded-host`) is documented in README.
- **Confidence:** Verified (red→green locally; live verification pending redeploy — the hardened live suite will prove it).

### H2 — CI push trigger corrupted (CI never ran on `main`) ❌ voided by pass 6 — see Pass 6, M3
- **Location:** `.github/workflows/ci.yml`.
- **Description:** The trigger read `branches: ain]` — a corrupted literal, so `push` events for `main` matched nothing and the entire gates+E2E pipeline silently stopped running on the primary branch (only `pull_request` still fired).
- **Evidence:** File inspection (`cat -A` for hidden bytes).
- **Remediation:** `branches: [main]`; plus the C2 secret-scan and production audit steps now ride the same pipeline.
- **Confidence:** Verified (file content). **Superseded:** pass 6's byte-level re-verification (`od -c` on every revision of the file) shows the trigger has been `branches: [main]` since `3d10201`; the "corruption" was a terminal rendering artifact that swallowed `[m`, and this finding — plus the corresponding README/PAD/SKILL notes — recorded the artifact, not the bytes.

## 🟡 Medium

### M1 — Live streaming test reported false "streamed" outcomes ✅ remediated
- **Location:** `tests/live-site.spec.ts`.
- **Description:** The test raced on the prompt text (`/live check ok/i`), which the optimistic user bubble renders immediately, so a send that failed server-side reported "streamed"; the follow-up `Copy response` assertion then failed misleadingly (and, had it not, a broken deployment would have passed).
- **Remediation:** The test now waits for a random nonce inside an **assistant** message only (`.message.assistant` scope), treats an error banner as a failure and surfaces the banner text, asserts the Copy control, and verifies persistence via `GET /api/conversations`.
- **Confidence:** Verified (the pre-fix run demonstrated the false positive; the rewritten test fails loudly on the current live build's 403).

## 🟢 Low

### L1 — Operator session scratch embedded in README/AGENTS ✅ remediated
- **Description:** Both docs carried session transcripts (duplicated "Commands for Next Cycle", Docker evidence logs, `bg_start`/`scandihaven` process notes, an npm terminal dump). Noise degrades trust in the docs and duplicated contradictory instructions.
- **Remediation:** Replaced with one concise "Docker Quick Start" section in README; AGENTS trimmed to the commands table, environment notes, architecture map, and non-obvious rules; every remaining claim re-verified against the code.

### L2 — Documentation staleness vs. live reality ✅ remediated
- **Description:** Pass-2 docs described the live database as unreachable (H2) — the operator has since restored it (`/api/health` → `{"ok":true}` live). Status rows now updated (see this file and README "Project status").
- **Confidence:** Verified (live probe).

## ⚪ Info (documented tradeoffs & backlog)

| # | Finding | Disposition |
|---|---------|-------------|
| I1 | Conversation-count cap (100) checks count then insert — concurrent creates can transiently exceed by one | Accepted: self-inflicted, bounded, self-corrects via retention; an advisory-lock/unique-window fix adds complexity without real risk |
| I2 | 429 lease-conflict path has no automated test (reaching the lease requires a valid provider key) | Backlog: extract the lease claim into an injectable seam if flake-free coverage is wanted; the SQL condition is reviewed and the atomic `UPDATE … WHERE busyUntil < now` pattern is concurrency-safe |
| I3 | CSP intentionally covers `frame-ancestors`/`base-uri`/`object-src` only | Unchanged — nonce-based `script-src` remains a deployment-specific hardening step (carried from pass 2) |
| I4 | `sample-build/src/app/workspace-polish.css` not adopted | The override layer targets sample-build's stylesheet, not this app's tuned `globals.css`; adopting it would stack contradictory rules. The two sample-build assets with standalone value (Radix navigation frame, incremental SSE parser) **were** adopted with tests |
| I5 | Lighthouse not re-run this pass | No render-path changes beyond additive CSS/a11y DOM changes; pass-2 baseline (90/100/96) stands until the next perf pass. Not executable in this sandbox without a display Chrome build |
| I6 | `npm prune` scheduling | Operator item (carried): schedule the retention CLI (e.g., weekly cron) |

## ✅ Passed checks (evidence-backed)

- **Ownership & isolation:** every conversation query filters by `owner` (SHA-256 of the cookie token); cross-session reads/mutations → 404 (local suite; live suite re-verified independent cookies).
- **CSRF/origin:** writes require the same-origin gate (now proxy-aware) + `sec-fetch-site` defense; cross-site → 403; `null` origin → 403.
- **Session cookie:** 256-bit token, HttpOnly, SameSite=Strict, Secure over HTTPS; only the digest stored; fixation impossible (server-generated).
- **Injection safety:** parameterized Drizzle only; zod at every boundary (16k chars, 2 MB image schema, UUID ids, 1–100 titles); react-markdown sanitizes model HTML; `img` elements replaced; links `noopener noreferrer`.
- **Resource limits:** 3 MB body (413), image magic-byte re-verification (2 MB), 16k prompts, 60-message/8 MB history caps, 600k response cap, 100-conversation cap, 175 s provider timeout, 195 s lease expiry, 3 s spacing — all server-enforced.
- **Concurrency:** atomic lease claim via conditional `UPDATE … RETURNING`; conditional release keyed to the lease value; delete refuses (409, `FOR UPDATE`) while a generation runs.
- **Streaming integrity:** shared SSE parser (now CR/CRLF/LF-parity, incrementally bounded); incomplete/failed provider streams never persisted; duplicate-retry guard; stop control aborts client- and server-side.
- **Privacy:** structured logs carry operation/ids/error types only; `reasoning_content` persisted server-side but stripped from every browser payload; no message contents in logs.
- **Error surfaces:** curated copy for every failure class (missing key 503, provider rejection 502, interrupted stream, oversized, degraded-API HTML) — verified against the real provider's 403 rejection this pass.
- **Accessibility:** axe WCAG 2.2 AA clean on welcome, dialogs, **and the error state** (local suite); mobile drawer is now a modal dialog with focus containment, Escape, in-drawer close, and focus restoration.
- **CI:** trigger repaired; pipeline = secret scan → typecheck → lint → unit → build → prod audit, plus an E2E job with a PostgreSQL service container.

## Remediation backlog (recommended next steps)

1. **[Operator] Rotate both exposed credentials** (C1, C2) — the GitHub SSH key and the NVIDIA key (even though it currently reads as dead); then optionally rewrite history with sign-off.
2. **[Operator] Redeploy the production build** — H1's fix is inert until deployed; then run `LIVE_SITE_URL=https://kimi-chat.jesspete.shop npx playwright test tests/live-site.spec.ts` and expect 12/12 including a real streamed answer.
3. **[Operator] Schedule retention** — `npm run prune -- --idle-days 30 [--conversation-days 90]` via weekly cron (I6).
4. **[Backlog] Lease-conflict (429) coverage** — extract the lease claim seam (I2).
5. **[Backlog, deploy-time] Nonce-based CSP `script-src`** (I3).
6. **[Backlog, perf pass] Re-baseline Lighthouse** after the next render-path change (I5).

---

# Pass 4 — 2026-09-10 (fresh clone, live-deployment validation, TDD remediation)

**Scope:** `src/**`, `tests/**`, `.github/workflows/ci.yml`, root configs, plus the live deployment (`https://kimi-chat.jesspete.shop/`). **Method:** the repo `code-review-and-audit` skill's tiered pipeline (audit_runner filtered to app code, dependency audit, CI-pattern secret scan, two expert review passes across correctness, security, data integrity, error handling, performance, testing, maintainability, consistency, dependency health) followed by red→green remediation of every accepted finding.

## Summary

| Severity | Found | Remediated this pass | Open after pass |
|----------|-------|----------------------|-----------------|
| 🔴 Critical | 0 | — | 2 operator rotations carried from pass 1–3 (SSH key in history; NVIDIA key rotation still pending) |
| 🟠 High | 2 | 2 | 0 (redeploy required for code fixes to reach the live site) |
| 🟡 Medium | 4 | 2 | 2 documented accepted risks |
| 🟢 Low | 9 | 8 | 1 (copy-timeout cleanup — benign, Informational) |
| ⚪ Info | 5 | 0 | 5 (documented tradeoffs) |

## Verification ledger (pass 4)

| Check | How | Result |
|-------|-----|--------|
| Type safety / lint / build | `npm run typecheck` → `npm run lint` → `npm run build` | ✅ pass |
| Unit tests | `npm test` | ✅ 22/22 (was 15 documented / 16 actual — README count now corrected) |
| Local E2E (API+UI+WCAG) | Playwright vs production build on embedded PostgreSQL 18 | ✅ 24/24 (12 workspace + 12 stream-ui; 7 new hermetic tests added this pass) |
| Live-site E2E | `LIVE_SITE_URL=https://kimi-chat.jesspete.shop npx playwright test tests/live-site.spec.ts` | ✅ 12/12, including a full provider round-trip (streamed + persisted) under degraded-slow provider conditions |
| Provider path probes | `curl` SSE round-trips against the live deployment | ✅ healthy at ~2s; also exercised the degraded path (meta delivered, ingress closes idle stream ~125s, lease 429 enforced, client shows retryable copy) |
| Secret scan (CI pattern) | `git grep -IE 'nvapi-…\|BEGIN …PRIVATE KEY…\|ghp_…\|AKIA…'` with reference-dir excludes | ✅ clean |
| Dependency audit | `npm audit --omit=dev` / `npm audit` | ✅ prod 0 / ⚠️ 4 moderate dev-only (esbuild chain via drizzle-kit — accepted, see M4) |
| `x-powered-by` | `curl -sI` local production server | ✅ absent after `poweredByHeader: false` |
| axe color contrast | computed ratios | ✅ `.char-count` 5.58:1 (`var(--muted)`), near-limit 5.85:1, banner 6.21:1 |

## 🟠 High (remediated)

### H1 — CI secret scan fails on tracked reference dirs; live-format provider key still in `sample-build/docs/` ✅ remediated
- **Location:** `.github/workflows/ci.yml` (scan step); `sample-build/docs/prompt-to-create.md:718`.
- **Evidence:** the CI grep pattern matched 10 tracked files under `skills/` and `sample-build/`; the sample-build doc carried the **same live-format `nvapi-` key** redacted from `docs/prompt-to-create.md` in pass 3 (sibling path was missed). The gates job would therefore fail on every push, destroying the gate's signal.
- **Remediation:** key redacted with the same marker string as pass 3 (`REDACTED-nvidia-api-key-rotate-any-live-key-see-CODE_REVIEW_REPORT`); the scan now excludes `skills/`, `sample-build/`, `docs/` — the same "reference material, not app code" contract as `tsconfig`/`eslint` — with a comment explaining why; verified clean.
- **Operator action (carried):** treat any key matching history as compromised; rotate the NVIDIA key. **Confidence:** Verified.

### H2 — Stop button re-submitted the form (duplicate send) ✅ remediated
- **Location:** `src/components/chat-workspace.tsx` send flow (`finally`).
- **Evidence:** with a plain hanging request (real socket, no route interception), clicking **Stop** aborted the fetch (instrumented: `AbortError` rejected) and then a **second `POST /api/chat` fired automatically** — a `submit` event whose `submitter` was the newly mounted "Send message" button, with no second click. Chromium re-targets the in-flight click's activation to the replacement default button when the stop button unmounts inside the same input task. Consequences: in the hang case the workspace was stuck busy forever; against the real server, every Stop produced an immediate duplicate send → 429 lease error.
- **Remediation:** the busy flip / `abortRef` clear are deferred by one macrotask so the swap lands outside the click's input task; verified by repro (banner + restored draft + enabled composer + no duplicate request) and held by a new hermetic regression test (`stop button aborts the stream and restores the draft`). **Confidence:** Verified (reproduced before and after).

## 🟡 Medium

### M1 — Raw parse errors could reach the error banner ✅ remediated
- **Location:** `chat-workspace.tsx` stream `consume()`. A malformed but complete SSE frame (`data: {broken`) threw `SyntaxError`/`ZodError`/parser "size limit" text straight into the banner — contradicting the documented boundary ("raw parse, network, or schema errors never reach the banner"). Server `error` events intentionally pass through and still do.
- **Remediation:** per-event parse wrapped; curated copy "The response stream was interrupted. Please try again." + hermetic test. **Confidence:** Verified.

### M2 — O(n²) markdown re-parse during streaming ✅ remediated
- `MarkdownMessage` re-ran remark+rehype-highlight for **every** message on every streaming render. `memo` added (props are primitives) — completed messages now skip re-parsing. **Confidence:** Verified (mechanism).

### M3 — Unauthenticated session-row creation ⚪ accepted risk (documented)
- `ensureSession` inserts a `chat_sessions` row per cookie-less `GET /api/conversations` → cheap DB-growth vector. The README's "Before public or enterprise deployment" already mandates ingress-level IP rate limiting for exactly this class of exposure; browser-session limits are documented as not a public-service defense. No code change in this pass. **Confidence:** Reasoned.

### M4 — 4 moderate dev-only vulnerabilities ⚪ accepted risk (documented)
- All are the esbuild dev-server advisory (GHSA-67mh-4wv8-2f99) via `drizzle-kit` → `@esbuild-kit/*`. Production audit is clean (0); the only "fix" npm offers is a breaking downgrade of `drizzle-kit` (0.31 → 0.18), which is worse than the exposure: `drizzle-kit` is a local CLI, never run in production. Revisit when drizzle-kit ships a fixed release. **Confidence:** Verified.

## 🟢 Low (8 remediated, 1 open)

| # | Finding | Resolution |
|---|---------|------------|
| L1 | `x-powered-by` advertised Next.js (observed on live headers) | `poweredByHeader: false`; verified absent |
| L2 | Dead code: unused `Zap` import, `.is-busy` class with no CSS, `.code-block .markdown-pre` selector matching nothing | Removed |
| L3 | Assistant persist skips the 60-message/16 MB re-check | Accepted with comment: lease serializes same-session sends, soft drift ≤ 1 message; dropping a finished answer after spend is worse |
| L4 | Error-path `send()` could throw on a closed controller | Wrapped with comment; lease release still runs |
| L5 | Toast (z-80) rendered under the lightbox (z-90/91) | Toast z-index → 95 (below skip link 100) |
| L6 | `.code-block pre` relied on append order to win over `.markdown pre` | Specificity raised (`.markdown .code-block pre`) |
| L7 | Double-send guard was closure-based only | `abortRef` non-null latch added |
| L8 | Copy said "under 2 MB" while the check allows exactly 2 MB | All four strings aligned to "up to 2 MB" |
| L9 | `setTimeout` handles in `copy()`/`copyCode` not cleaned on unmount | Open — benign post-unmount setState, no user-visible effect |

## ⚪ Informational

- Live E2E selector: `getByRole("alert")` matched Next.js's always-present empty route announcer, so the provider round-trip test could fail spuriously with an empty banner (observed on the first pass-4 live run). Fixed to `.error-banner`; race window widened to 150s (> the 175s provider timeout's observable failure modes) with the rationale in-file.
- README documented "15/15 unit tests" while the suite had 16 (a graduated-maxTokens test postdated the count); corrected to the actual 22/22 after this pass's additions, and Tailwind/pg version drift (4.1→4.3, 8.20→8.23) fixed.
- `seed.ts` comment claimed an extension check that the code never performed; comment aligned to behavior.
- `workspaceLoadError` distinguishes a down database from a generic failure; when the health probe itself is unreachable it falls back to reload copy (deliberate: no health endpoint → nothing actionable to say).
- Test-coverage backlog (untested paths, priority order): retry ("Try again") after an accepted-then-failed stream; 429 busy-state UI; clipboard write assertions; rename/export dialog flows; lightbox Escape; search server-failure degradation.

## Remediation backlog (operator / next pass)

1. Rotate the NVIDIA provider key and the SSH deployment key (carried from passes 1–3; `sample-build/docs` redaction does not unpublish history).
2. Redeploy the production build so H2/M1/L-fixes take effect on the live site (verified locally and via the live suite against the **current** deployment; the fixes themselves ship with the next deploy).
3. Ingress-level rate limiting before public exposure (see M3).
4. Work the Informational test-coverage backlog as flakiness budget allows.

---

# Pass 5 — 2026-09-10 (ResponseAborted runtime-log investigation, abort taxonomy remediation)

**Scope:** the `chat.stream` runtime log `{"operation":"…","errorType":"ResponseAborted"}` reported from a local production run (`PORT=3003 npm run start`); `src/lib/stream-abort.ts` (new), `src/app/api/chat/route.ts`, `src/lib/server.ts`, `tests/core.test.mjs`, docs. **Method:** the repo `diagnosing-bugs` skill loop (feedback harness → instrumentation → deterministic repro) followed by red→green remediation per the `tdd` skill.

## Root cause (verified end-to-end, not an app defect)

`ResponseAborted` is Next.js 16's named error for "the client disconnected before the response finished" (`next/dist/server/web/spec-extension/adapters/next-request.js`: on `ServerResponse 'close'` before `writableFinished`, both `request.signal` and the pipe signal are aborted with `new ResponseAborted()`). Verified propagation in a deterministic local repro (fake NVIDIA provider preload honoring the fetch-spec abort contract + curl mid-stream kill against the production build):

1. Browser closes the SSE connection (Stop button, refresh, tab close, navigating to another chat, network drop).
2. `request.signal` aborts with the `ResponseAborted` instance → the route's `AbortSignal.any([aborter, req.signal, timeout])` carries that reason to the upstream provider fetch.
3. The pending upstream `reader.read()` rejects with the `ResponseAborted` instance → the route's catch logged it via `console.error` with the cryptic runtime name.

Probes also showed the pipeline's cancel path (`pipeTo → source.cancel → route cancel() → aborter.abort()` with no reason) can win the race, surfacing the **same disconnect as `AbortError`**; the route's own deadline surfaces as `TimeoutError`; and a disconnect during a create-path body upload surfaces as Node's body-stream signature (`Error`/`"aborted"`/`ECONNRESET` — captured live). Post-abort invariants were verified in the database: the lease is released and partial assistant output is intentionally discarded (the retry-dedupe guard depends on it). The happy path logs nothing. **So the pipeline behaved correctly — the gap was observability: an expected, client-driven teardown was logged at error level under a runtime-specific name, indistinguishable from genuine failures.**

## Findings & remediation

| ID | Severity | Finding | Remediation |
|----|----------|---------|-------------|
| A1 | 🟡 Medium | Expected client disconnects logged at error level with runtime-specific names (`ResponseAborted`/`AbortError`), indistinguishable from genuine failures | `src/lib/stream-abort.ts`: `streamAbortKind(error)` → `"client-disconnect" \| "timeout" \| null` covering all four runtime signatures; route catch logs warn-level `{operation, conversationId, outcome:"aborted", abortBy, partialChars}`; genuine failures keep the established error-level shape |
| A2 | 🟡 Medium | Same misclassification in the shared `errorResponse` funnel (e.g. disconnect while a 2 MB attachment body is uploading → error-level `errorType:"Error"` at `chat.create`) | `errorResponse` classifies via `streamAbortKind`; aborts log warn-level `{operation, requestId, outcome:"aborted", abortBy, errorType}`; HTTP behavior unchanged |
| A3 | ⚪ Info | No documentation explained `ResponseAborted`, guaranteeing repeat investigations | CLAUDE.md abort-taxonomy rule, README troubleshooting row, AGENTS.md non-obvious rule, PAD Pattern 5 + directory annotations updated |

**Deliberately unchanged (verified correct):** lease release on abort (DB-verified `busy_until` reset), upstream fetch cancellation via the composite signal (no wasted provider spend), partial-content discard (retry-dedupe contract), client-facing copy, silent happy path.

## Verification ledger (pass 5)

| Check | How | Result |
|-------|-----|--------|
| Deterministic repro (pre-fix) | fake-provider preload + `curl -m 1.2` mid-stream kill vs production build; `AbortController.abort`/`AbortSignal.any` instrumentation | ✅ reproduced the exact reported log line (`errorType:"ResponseAborted"`) and the racy `AbortError` alias |
| Unit tests | `npm test` | ✅ 28/28 (6 new: classification table incl. Node body signature + pg-reset negative, log shapers' levels/shapes/no-content-leak) |
| Type safety / lint / build | `npm run typecheck` → `npm run lint` → `npm run build` | ✅ pass |
| Local E2E | Playwright vs production build on embedded PostgreSQL 18 | ✅ 24/24 (12 skipped live by design) |
| Post-fix live verification | same repro harness, three cases | ✅ mid-stream abort → warn `{outcome:"aborted", abortBy:"client-disconnect", partialChars}`; happy path → silent; mid-upload disconnect → warn `chat.create` abort log; **zero error-level abort lines** |
| Lease integrity after abort | `select busy_until from chat_sessions` | ✅ reset to epoch in every aborted case |

---

# Pass 6 — 2026-09-10 (fresh clone, sample-build alignment, byte-safe evidence discipline)

**Scope:** `src/**`, `tests/**`, `.env` tracking state, root docs, and the live deployment (`https://kimi-chat.jesspete.shop/`). **Method:** fresh-clone contract re-verification of every AGENTS/CLAUDE/README claim against the code; full local gates (typecheck → lint → 28 unit → build) on embedded PostgreSQL 18.4; browser E2E locally (24/24) and live (12/12); tiered diff of `sample-build/` (an enhanced derivative of upstream `dd276ce` with its own verified pass, see `sample-build/docs/VERIFICATION.md`) against `src/`; red→green remediation of every accepted finding; byte-level (`od -c`) verification for every claim involving bracket sequences.

## Summary

| Severity | Found | Remediated this pass | Open after pass |
|----------|-------|----------------------|-----------------|
| 🔴 Critical | 1 | 1 (code) | 2 operator rotations carried (SSH key in history; NVIDIA key rotation still pending) |
| 🟠 High | 2 | 2 | 0 |
| 🟡 Medium | 3 | 3 | 0 |
| 🟢 Low | 3 | 3 | 0 |
| ⚪ Info | 3 | 1 | 2 (documented tradeoffs) |
| ❌ Voided | 1 | — | Pass-3 H2 (CI trigger) reclassified as a display artifact |

## 🔴 Critical

### C1 — `.env` re-tracked with a live-format provider key by the sample-build commit ✅ remediated (code) / rotation still pending
- **Location:** `.env` at repo root, added to tracking by `797f5c5` ("update sample build"), which renamed `sample-build/.env.example` → `/.env`. The file carries an `nvapi-` key in live format.
- **Description:** Pass 3 (commit `272d7ff`) had untracked `.env` for exactly this exposure; nine commits later the same class of exposure returned through an innocent-looking rename, and no gate fired — see V1 below for why the CI trigger was not the reason this time (it was healthy; CI simply had not been observed running because no push exercised it between the two states — the secret scan only runs on CI events).
- **Evidence:** `git ls-files` lists `.env`; `rg -c 'nvapi-[A-Za-z0-9_-]{20,}' .env` → 1; `git show --stat 797f5c5` shows the rename. Byte-verified.
- **Remediation:** `git rm --cached .env` (file stays locally; `.gitignore` rule now applies); the CI-pattern secret scan over tracked files is clean again. Any key that ever matched history must still be rotated by the operator — removal does not unpublish `7afe083`, `797f5c5`, or anything pushed in between.
- **Confidence:** Verified.

## 🟠 High

### H1 — Completed long answers could fail in the browser after the server persisted them ✅ remediated (ported sample-build M2)
- **Location:** `src/lib/sse.ts` (fixed 1M-character event cap) and the workspace's parser construction.
- **Description:** The server accepts answers up to 1.2M characters (content + reasoning) and streams the completed answer as a single JSON-escaped `done` event. The browser parser capped any event at 1M characters, so an answer near the cap threw "Stream event exceeds the size limit." client-side: the user saw an interruption error for an answer the server had already saved.
- **Evidence (red):** `tests/stream-limit.test.mjs` boundary test (1.2M-char answer, JSON-escaped, chunked at 16 KB) threw the size-limit error; a custom-limit test proved the constructor ignored arguments entirely.
- **Remediation (green):** `SSEParser(maxEventCharacters = 1_000_000)` with `RangeError` validation (safe integer, 1–8M); server-side provider parsing keeps the 1M default; the workspace constructs `new SSEParser(8_000_000)` for browser frames. 3 unit tests; 31/31 pass.
- **Confidence:** Verified (red→green locally; the defect reproduces deterministically at the boundary).
- **Note:** The live deployment has not been redeployed with this fix; it ships with the next deploy.

### H2 — Raw transport errors reached the banner ✅ remediated (ported sample-build M3 + extension)
- **Location:** `chat-workspace.tsx` `sendMessage` catch and `openConversation` catch.
- **Description:** Any `Error` instance's message was shown verbatim, so `TypeError: Failed to fetch` / `network error` (observed live per the sample-build verification) reached the UI. `openConversation` had the same hole for non-Error throws and for raw fetch rejections.
- **Remediation (TDD):** `WorkspaceRequestError` now marks intentionally curated copy and only it is shown verbatim; everything else in `sendMessage` renders "The connection was interrupted. Check your network and try again." and in `openConversation` renders "Could not open this conversation. Check your network and try again." The malformed-frame guard joined the boundary class so a degraded-proxy stream keeps its stream-interrupted copy rather than being misclassified as a network failure (caught by the existing malformed-stream test, which failed against the first cut and passes after). Tests: `network-recovery.spec.ts` (1), `recovery.spec.ts` network-on-open case (1, new this pass).
- **Confidence:** Verified (red→green).

### H3 — Failed conversation navigation left the previous chat as the send destination ✅ remediated (ported sample-build H1)
- **Location:** `chat-workspace.tsx` `openConversation`.
- **Description:** A failed conversation load kept `currentId` pointing at the previously open conversation; the breadcrumb still showed the old title and the next message would send with the old `conversationId` — unintended context.
- **Evidence (red):** `recovery.spec.ts` "failed conversation navigation clears the previous send destination": POST carried the stale conversation id, breadcrumb showed the old title.
- **Remediation (green):** `setCurrentId(undefined)` before the fetch (sequence guard unchanged); POST carries no conversation id, breadcrumb reads "New chat".
- **Confidence:** Verified (red→green).

## 🟡 Medium

### M1 — Search results were not bound to their query ✅ remediated (ported sample-build M1)
- **Location:** `chat-workspace.tsx` search effect (`serverResults` replaced only on success).
- **Description:** A slow or failed server search left the previous query's results visible as if they matched the new term; failures degraded silently with no retry affordance.
- **Evidence (red):** `recovery.spec.ts` both failure modes (503 and malformed contract): Alpha results remained after switching to Beta; no fallback notice; retry impossible.
- **Remediation (green):** results are stored as `{term, items, failed}` and only rendered when `term === search.trim()`; failures fall back to local title matching behind a `role="status"` notice ("Full-text search is unavailable. Showing title matches only.") with a Retry control; `searchAttempt` re-runs the effect. Local title filtering now trims the term (L3).
- **Confidence:** Verified (red→green).

### M2 — Welcome entry animation transiently violated AA contrast ✅ remediated (ported sample-build M5)
- **Location:** the `welcome` entry animation (opacity fade in `globals.css`), remediated by the adopted `workspace-polish.css` layer.
- **Description:** the sample-build pass measured 4.41:1 on starter descriptions mid-entry (ancestor opacity ~0.45). The polish layer replaces it with a position-only `welcome-settle` animation that keeps text fully opaque.
- **Evidence:** full local suite including axe WCAG AA on welcome, dialogs, and the error state passes 29/29 against the new build.
- **Confidence:** Verified (via the ported layer's own verification plus this pass's axe runs).

### M3 — Audit-trail integrity: a rendering artifact entered the record as a "corrupted" CI trigger ❌ voided (V1)
- **Location:** pass-3 H2 above; mirrored in README, PAD, and `new-chat_SKILL.md`.
- **Description:** terminals in this toolchain can swallow the byte pair `[m` when rendering output, so `branches: [main]` displays as `branches: ain]`. Pass 3 recorded the rendered string as file content, "fixed" it (its diff never touched the trigger), and the docs propagated the story. This pass initially repeated the same mistake in a commit message, then caught it.
- **Evidence:** `od -c` over all four revisions of `.github/workflows/ci.yml` (`3d10201`, `ba0f0b8`, `dc1c664`, `db9dab4`) — every one contains the bytes `b r a n c h e s :   [ m a i n ]`; the commit `dc1c664` diff shows no trigger change.
- **Remediation:** the trigger was never broken, so no code change is needed; the record is corrected here, in README's change log, the PAD, and the SKILL file. Historical ledger entries above are annotated, not rewritten.
- **Confidence:** Verified (byte-level). Process rule going forward: any claim involving bracket sequences in this environment is checked with a byte-safe method (counts, `od -c`, or scripted analysis) before it enters a finding, a commit message, or a doc.

## 🟢 Low

| # | Finding | Resolution |
|---|---------|------------|
| L1 | `.conversation-list` not keyboard-focusable (axe `scrollable-region-focusable`) | `tabIndex={0}` on the nav (ported; sample-build M4) |
| L3 | Local title filtering matched the untrimmed term | `search.trim().toLowerCase()` (aligned with the server-side trim) |
| L9 | Copy-acknowledgement timers not cleared on re-copy/unmount (carried open from pass 4) | Handles live in refs, cleared before each new copy and on unmount (`copy()` + `copyCode()`); code-inspection verified, no observable behavior change to assert |

## ⚪ Informational

- **I1 — Live-suite hardening adopted:** the strengthened live-site spec (Secure-cookie assertion, exact-403 cross-origin rejection, 200 s provider window, persisted-answer verification via `GET /api/conversations/[id]` with reasoning-strip assertion, self-cleanup DELETE) replaced the weaker in-tree version; 12/12 against the live deployment.
- **I2 — Polish layer adopted:** `workspace-polish.css` + bloom-mark emblem + `icon.svg` favicon ported from sample-build. The layer was verified to reference only classes this app renders (plus `search-feedback`, added with M1). `.emblem-glow`/`.emblem-star` rules in `globals.css` are now inert (no matching markup) but kept byte-identical to sample-build for clean future diffs.
- **I3 — Carried operator backlog (unchanged):** rotate both exposed credentials (C1/C2 chain); redeploy to ship pass-6 fixes; schedule `npm run prune`; nonce-based CSP `script-src`; Lighthouse re-baseline after this render-path change (the polish layer changed fonts/layout, so the pass-2 baseline no longer applies).

## Verification ledger (pass 6)

| Check | How | Result |
|-------|-----|--------|
| Fresh-clone baseline gates | `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` | ✅ 28/28 unit pre-change; typecheck/lint/build clean |
| Local E2E (pre-change) | Playwright vs production build (`:3004`) on embedded PostgreSQL 18.4 (`embedded-postgres` npm package; `pgcrypto` extension created; migration hash `d5d43cb…` confirmed) | ✅ 24/24 (4 initial failures were environmental — fixtures need `DATABASE_URL` in the test process; passed with it) |
| Live E2E (pre-change) | `LIVE_SITE_URL=https://kimi-chat.jesspete.shop npx playwright test tests/live-site.spec.ts` | ✅ 12/12 including a full provider round-trip |
| `.env` tracking | `git ls-files`, `rg -c` key pattern, `git show --stat 797f5c5`, `git check-ignore` after fix | ✅ verified exposure → verified remediated |
| CI trigger bytes | `od -c` on all 4 revisions of ci.yml + scripted per-line analysis of docs | ✅ always `[main]`; phantom finding documented |
| SSE parser boundary | `tests/stream-limit.test.mjs` (red → green), full unit suite | ✅ 31/31 |
| Search/nav/network hardening | `tests/recovery.spec.ts` (4), `tests/network-recovery.spec.ts` (1) — red → green | ✅ 5/5 |
| Full local suite (post-change) | workspace 12 + stream-ui 12 + recovery 4 + network-recovery 1 vs rebuilt production server | ✅ 29/29 (incl. axe WCAG AA: welcome, dialogs, error state) |
| Live E2E (post-change, strengthened spec) | `LIVE_SITE_URL=…` run against the current deployment | ✅ 12/12 (fixes ship with next deploy) |
| Secret scan (CI pattern, tracked files) | `git grep -lIE 'nvapi-…\|BEGIN …PRIVATE KEY…\|ghp_…\|AKIA…' -- . ':!package-lock.json' ':!skills' ':!sample-build' ':!docs'` | ✅ clean |
| Dependency audit | `npm audit --omit=dev` / `npm audit` | ✅ prod 0 / dev-only esbuild chain unchanged (M4, pass 4) |

## Remediation backlog (operator / next pass)

1. Rotate the NVIDIA provider key and the SSH deployment key (carried; `797f5c5` re-exposed a key-format credential in tracked history).
2. Redeploy the production build so pass-6 fixes reach the live site; then re-run the strengthened live suite.
3. Schedule retention (`npm run prune -- --idle-days 30`) via weekly cron.
4. Re-baseline Lighthouse after the polish-layer render changes.
5. Nonce-based CSP `script-src` (deploy-time hardening).

---

# Pass 7 — 2026-09-11 (improvement pass, fresh-clone live re-verification, Lighthouse re-baseline)

**Scope:** `src/**`, `tests/**`, root docs, and the live deployment (`https://kimi-chat.jesspete.shop/`). **Method:** tiered pipeline per the repo `code-review-and-audit` skill (native CLI fallback mode, consistent with passes 3–6): static gates, secret scan, dependency audit, dangerous-pattern scan, 12-category manual review of every app file, independent expert sub-agent review of the session's diff, full unit + local E2E suites, live-site browser E2E + supplemental API probes, and a Lighthouse re-baseline against the live deployment (closing deferred item I5).

## Summary

| Severity | Found this pass | Remediated this pass | Open after pass |
|----------|-----------------|----------------------|-----------------|
| 🔴 Critical | 1 (operator credential — not a code defect) | 0 (not code-fixable) | 2 operator rotations carried (SSH key, NVIDIA key) |
| 🟠 High | 0 | — | 0 |
| 🟡 Medium | 0 | — | 0 |
| 🟢 Low | 2 | 2 (fixed below as R1/R2) | 0 |
| ⚪ Info | 5 | 5 | 0 (4 documented; Lighthouse re-baselined) |

The application code is **shippable**: no Critical/High/Medium code findings. The single Critical item is the live deployment's dead `NVIDIA_API_KEY` — an operator credential rotation, not a code defect (the route's degraded path was verified working end to end).

## Verification ledger (pass 7)

| Check | How | Result |
|-------|-----|--------|
| Static gates | `npm run typecheck` → `npm run lint` → `npm test` → `npm run build` (fresh clone + changes, re-run post-remediation) | ✅ all green; 41/41 unit (31 pre-change baseline + 10 title derivation) |
| Local E2E | Playwright vs production build (`:3004`) on embedded PostgreSQL 18.4 (pgcrypto+pg_trgm; migration hash `d5d43cb…` confirmed) | ✅ 31/31 (13 workspace incl. new 409 guard test, 12 stream-ui, 5 recovery incl. new curated-toast test, 1 network-recovery) |
| Live-site E2E | `LIVE_SITE_URL=https://kimi-chat.jesspete.shop npx playwright test tests/live-site.spec.ts` | ⚠️ 11/12 — provider round-trip fails: deployed key rejected by NVIDIA (see A1) |
| Live supplemental probes | API edge cases: empty prompt 400, 16k+ prompt 400, non-JSON 415, bad image magic bytes 400, lease spacing 429 (verified twice), PATCH rename + DELETE cleanup, `?q=` search isolation | ✅ 9/9 |
| Secret scan | `git grep` credential patterns over app code (same exclusion contract as CI) | ✅ clean; `.env` untracked (only `.env.example` with placeholder `nvapi-...`) |
| Dangerous patterns | grep `eval|new Function|dangerouslySetInnerHTML|innerHTML|document.write|NEXT_PUBLIC_|console.log` over `src/` | ✅ none |
| Dependency audit | `npm audit --omit=dev` / `npm audit` | ✅ prod 0 vulnerabilities; dev-only 4 moderate (esbuild chain via drizzle-kit — carried tradeoff from passes 2–6, fix is a breaking downgrade) |
| SQL injection surface | all queries Drizzle-parameterized; `sql` templates bind `searchPattern()` output; no string concatenation | ✅ clean |
| Security headers (live) | `curl -sI` against deployment | ✅ nosniff, DENY, HSTS `63072000; includeSubDomains`, referrer-policy, permissions-policy, CSP `frame-ancestors 'none'; base-uri 'self'; object-src 'none'` |
| Lighthouse (live) | v13.4.1, headless chromium, 4 categories | ✅ re-baselines deferred I5: **performance 97 · accessibility 100 · best-practices 100** (SEO 63 is by-design `noindex` for a private workspace). FCP 1.6 s · LCP 2.3 s · TBT 120 ms · CLS **0** · SI 1.6 s · TTI 2.9 s |
| Expert diff review | Independent reviewer sub-agent over the session's uncommitted diff (axes: correctness, test quality, security, consistency, docs accuracy) | ✅ verdict "safe to commit"; 2 Low + 3 Info findings, all adopted below |
| Contract re-verification | Every AGENTS/CLAUDE/README claim checked against code (commands, counts, limits, routes, patterns) | ✅ aligned; live-verification status refreshed in all three docs |

## 🔴 Critical

### A1 — Live deployment's NVIDIA API key is rejected (chat broken in production) ⚠️ OPEN (operator action)
- **Location:** server environment of `https://kimi-chat.jesspete.shop/` (not a code defect).
- **Description:** The deployment reports `configured: true` (a key is present), but NVIDIA answers the chat-completions call with 401/403, so every send surfaces the curated banner "NVIDIA rejected the server API key. Check the key and model access in your NVIDIA account." The key is dead, not missing. This is the live manifestation of the carried C2 rotation item: pass 6 verified a full round-trip on 2026-09-10 with a then-valid key; the credential has since been rejected.
- **Evidence:** Live E2E failure with banner text captured by the suite; direct `curl` probe reproduces it: `POST /api/chat` returns `meta` event then `error` event with the key-rejection copy; every other live check (headers, Secure cookie, exact-403 cross-origin, API contract, session isolation, WCAG) passes 11/12.
- **Required action:** Rotate `NVIDIA_API_KEY` on the deployment with a valid key from build.nvidia.com, then re-run `LIVE_SITE_URL=https://kimi-chat.jesspete.shop npx playwright test tests/live-site.spec.ts` — expected 12/12.
- **Confidence:** Verified (two independent reproductions: browser E2E + direct API probe).

## 🟢 Low

### R1 — Auto-title cap can exceed the rename schema's limit for astral-heavy prompts ✅ remediated this pass
- **Location:** `src/lib/title.ts` (this session's new helper) interacting with `titleSchema` (`.max(100)` counts UTF-16 units).
- **Description:** A 70-code-point title composed mostly of astral characters can be up to 140 UTF-16 units, which the rename path (`.max(100)`) would reject verbatim — a confusing rename UX for that conversation. Surfaced by the expert diff review.
- **Remediation:** `deriveTitle` now trims trailing whitespace and additionally truncates to 100 UTF-16 units when astral characters push past it (both caps enforced); unit tests pin the contract.
- **Confidence:** Verified (red → green).

### R2 — 409 test could leak a session row on early failure ✅ remediated this pass
- **Location:** `tests/workspace.spec.ts` (this session's new test).
- **Description:** If the session cookie were missing, the test threw before registering the owner for `finally` cleanup, leaking a session row into the disposable test DB. Inherited from the older CRUD test's shape.
- **Remediation:** The owner is registered for cleanup before dereferencing the cookie; an explicit cookie assertion moved after registration.
- **Confidence:** Verified (code inspection; failure path now unconditionally attempts cleanup).

## ⚪ Informational (all adopted)

| # | Finding | Disposition |
|---|---------|-------------|
| R3 | `\s+` collapse also converts Unicode whitespace (NBSP, U+3000) to ASCII spaces in titles — deterministic and desirable for single-line sidebar titles, now documented | Comment extended + unit test with `\u3000` |
| R4 | The 70-point cap could leave a trailing space; cosmetic only | `trimEnd` added in the same fix as R1 |
| R5 | Empty / whitespace-only `deriveTitle` case was untested (unreachable via the route's zod `.trim().min(1)`) | Unit test added pinning `""` |
| R6 | Lighthouse baseline stale after the pass-6 render-path change (deferred I5) | **Re-baselined against the live deployment: 97 / 100 / 100** (SEO 63 by-design noindex) |
| R7 | 429 lease-conflict has no automated API test (carried I2) | Verified live this pass via direct probe (spacing 429 + documented copy observed on the deployment); repo disposition unchanged (extract-seam coverage remains optional) |

## Improvement changes landed this pass (TDD, red → green)

| Change | Tests |
|--------|-------|
| Mutation (rename/delete) failures show curated toast copy; raw transport text (`Failed to fetch`) can no longer reach the UI — closing the pass-6 error boundary's last gap | `recovery.spec.ts` (red: raw "Failed to fetch" observed; green: curated copy) |
| New-conversation titles collapse whitespace and cut surrogate-safely (`src/lib/title.ts`) | 10 unit tests in `core.test.mjs` (6 initial + 4 with the R1/R3/R4/R5 remediation) |
| 409 delete-while-generating guard regression test (FOR UPDATE + `busyUntil` lease) | `workspace.spec.ts` (closes the coverage gap for the documented guard) |

## Remediation backlog (operator / next pass)

The full findings → ToDo table with per-item root cause, fix, tests, and status lives in `remediation-plan-2026-09-11.md` (repo root). In brief:

1. Rotate `NVIDIA_API_KEY` on the deployment (A1 — restores live chat; then re-run the live suite expecting 12/12).
2. Rotate the SSH deployment key and the NVIDIA key that remain in git history (carried C1/C2 chain from passes 1–6).
3. Schedule retention (`npm run prune -- --idle-days 30`) via weekly cron (carried I6).
4. Nonce-based CSP `script-src` (carried I3, deploy-time hardening).
