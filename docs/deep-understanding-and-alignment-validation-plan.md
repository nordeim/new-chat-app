# Deep Understanding & Alignment Validation Plan — Kimi Workspace (new-chat-app)

> Meticulous Approach: ANALYZE → PLAN → VALIDATE → IMPLEMENT → VERIFY → DELIVER
> Status: **PLAN phase — awaiting explicit user confirmation before any codebase mutation**

---

## 1. Executive Summary

**Goal:** Achieve a deep, evidence-backed understanding of the project by cross-reading `AGENTS.md`, `CLAUDE.md`, and `README.md`, then **validate every contractual claim against the live codebase** to confirm alignment and establish the true current project status (post-pass 9).

**Why now:** The three contract docs are unusually dense (AGENTS = agent onboarding, CLAUDE = durable engineering constitution, README = external truth) and the codebase has 9 audit passes of remediation. Claims drift easily. A byte-safe, probe-driven validation is required before any new work.

**Outcome if approved:** A `VALIDATION_HANDOFF_*.md` + updated contract-doc delta list + green verification ledger (`typecheck → lint → unit → build → e2e`) with zero gate-weakening.

---

## 2. Deep Understanding — Synthesized from the Three Docs

### 2.1 What this is (all three agree)
- **Next.js 16 App Router chat workspace "Kimi"** — streamed NVIDIA NIM `moonshotai/kimi-k3` (OpenAI-compatible SSE), PostgreSQL persistence via Drizzle ORM, browser-session cookie isolation. React 19, Tailwind v4 CSS-first, TypeScript strict.
- **Not a generic starter:** token-by-token SSE, atomic one-generation-per-workspace lease, searchable history across JSONB message content, image-aware composer with magic-byte re-verification, GFM + highlight.js answers, Radix lightbox/drawer, mint editorial layer.
- **Browser-session isolation** — 64-hex `kimi_session` cookie, only SHA-256 digest stored as `owner`. No enterprise identity; deployment must add SSO/RBAC for public use.

### 2.2 Architecture (request path — all three converge)
```
Browser → POST /api/chat → origin + session + zod + magic-byte → atomic lease (195s; 615s if max_tokens>16,384; 3s spacing)
→ conversation upsert (retry-safe dedup) → NVIDIA fetch (175s; 590s long) → SSE parse (1M provider / 8M browser)
→ persist final answer only → SSE events (meta/thinking/delta/done/error) → browser
                              ↘ : keep-alive comment frames every 15s while silent (Cloudflare ~100s idle guard)
```

### 2.3 Contract doc roles (distinct emphasis)
| Doc | Audience | Unique emphasis |
|-----|----------|-----------------|
| `AGENTS.md` | AI agent next to start | Commands table, Architecture map (file-by-file why), Non-obvious rules (deferred busy flip, alert scoping, abort taxonomy, 2 MB copy lock, keepalive, throttle, excludes for skills/sample-build/docs) |
| `CLAUDE.md` | Durable engineering constitution | Six-phase workflow, Server-is-authority / No-silent-failure / Streaming-integrity / Session-isolation / Curated-failure principles, Implementation standards (TS/React/Next/Tailwind), Testing pyramid (55 unit + 34 Playwright + live), Abort taxonomy names, Security headers baseline |
| `README.md` | External/operator truth | Marketing narrative + Features table, Architecture diagram, Quick Start + Docker Quick Start, NVIDIA contract table, API reference, Data & security boundaries, Project status & recent changes (2026-09-12 pass 9), Design tokens, Troubleshooting |

### 2.4 Critical invariants distilled
- **Server is authority** on all limits (60 msgs/conv, 100 convs/workspace, 16k chars, 2 MB image with 2.8M base64 pre-cap, 1.2M response, ~16MB history, 10 searches/10s/session on `?q`).
- **Curated error boundary:** only `WorkspaceRequestError` shown verbatim; raw `Error` → network-interrupted copy. Covers send + open + rename/delete toast.
- **Same-origin write gate** (`src/lib/origin.ts`) pure, matches `Host` OR first `x-forwarded-host`, rejects `sec-fetch-site: cross-site` / malformed / non-http(s).
- **Lease + timeout coupling:** `maxDuration 600` on route, provider timeout 175/590, lease 195/615 — timeout < lease so lease release always wins.
- **SSE duality:** `src/lib/sse.ts` 1M default (provider), browser constructs 8M (final `done` ~1.2M escaped). Comment frames `: keep-alive` ignored; `startKeepAlive` guarded by abort signal + try/catch.
- **No weakening gates:** no `@ts-ignore`, no disabling rules, no deleting tests. `tsconfig`/`eslint` excludes for `skills/ sample-build/ docs` are intentional.
- **Operational debt carried:** SSH private key in `docs/ssh-key.txt` history + provider key in `.env` history — both rotations pending operator action. Live deployment `NVIDIA_API_KEY` present (`configured:true`) but provider stalls >200s after `meta` (keepalive now prevents Cloudflare idle cut, but round-trip still needs key/egress verification).

---

## 3. Validation Strategy — How Deep Understanding Will Be Proved Against Code

### 3.1 Principles for validation
- **Source is ground truth:** every doc sentence maps to a grep / file-read / gate result. No claim accepted on prose alone.
- **Byte-safe evidence:** CSP, CI trigger, cookie flags, SQL caps checked with `rg`, `od -c`, `curl -sI`, and `next typegen` — not terminal rendering.
- **Probe order:** fast static probes first (types, lint, config), then unit, then build, then DB-backed E2E (requires `npm run build && npm start` + disposable `DATABASE_URL`).
- **Do not re-prove prior audit evidence blindly:** re-run the pass-9 ledger checks (`docs/CODE_REVIEW_REPORT.md`) and flag any drift.

### 3.2 Phase breakdown (sequential, with exit criteria)

| Phase | Title | Objectives | Checklist | Success criteria | Verify |
|-------|-------|------------|-----------|------------------|--------|
| **1** | **ANALYZE — Contract ingestion** | Read `AGENTS.md` / `CLAUDE.md` / `README.md` in full; extract every verifiable claim | □ Read all three docs line-by-line (done in reconnaissance) <br>□ Extract commands, env, architecture map, non-obvious rules, limits, headers, DB lifecycle, testing pyramid, debt | Claim inventory table produced | `docs/deep-understanding-and-alignment-validation-plan.md` §2 (this doc) |
| **2** | **PLAN — Validation blueprint** | Convert claim inventory into probe matrix; get explicit user confirmation | □ Map each claim → file/probe (see §3.3) <br>□ Order probes by cost <br>□ Present this plan <br>□ **STOP — await VALIDATE** | User says "proceed" | `ask_user` confirmation |
| **3** | **VALIDATE — User alignment gate** | Confirm scope, risks, and non-goals | □ Confirm: no code mutation in this gate <br>□ Confirm live-site E2E is optional (needs `LIVE_SITE_URL`) <br>□ Confirm DB reset policy (`docker compose down -v` is destructive) | Explicit approval + any scope tweaks | User reply |
| **4** | **IMPLEMENT — Codebase alignment sweep** | Execute probe matrix against codebase, file-by-file | □ Config alignment (§3.3.A) <br>□ Route & lib alignment (§3.3.B) <br>□ DB & scripts alignment (§3.3.C) <br>□ Component & styling alignment (§3.3.D) <br>□ Testing & CI alignment (§3.3.E) <br>□ Security & debt alignment (§3.3.F) <br>□ Record evidence lines (command + output hash) | Probe matrix fully executed, mismatches logged | Files read + bash probes |
| **5** | **VERIFY — Gates & status confirmation** | Run authoritative verification order and confirm current project status | □ `npm run typecheck` (next typegen + tsc) <br>□ `npm run lint` <br>□ `npm test` (expect 55 unit) <br>□ `npm run build` (6 routes) <br>□ DB health: `docker compose ps` → `npm run db:setup` → `curl /api/health` <br>□ E2E if DB healthy: `npm run test:e2e` (expect 34 local) <br>□ Live E2E only if `LIVE_SITE_URL` set <br>□ Compare live header/CSP/cookie vs `next.config.ts` | Green ledger matching README's "2026-09-12 post-pass 9" line | Gate logs |
| **6** | **DELIVER — Handoff & contract sync** | Produce alignment report; propose minimal doc fixes if drift found | □ Write `docs/VALIDATION_HANDOFF_2026-09-12.md` (or dated) <br>□ Table: claim → evidence → aligned / drift <br>□ Severity-ranked drift list <br>□ Propose `README/AGENTS/CLAUDE` deltas (do not apply without second confirmation) | Handoff file + next-steps list | Markdown file |

### 3.3 Probe matrix — claim → where to look → how to prove

#### A. Config & toolchain
| Claim | File(s) | Probe |
|-------|---------|-------|
| `tsconfig`/`eslint` exclude `skills/ sample-build/ docs` | `tsconfig.json`, `eslint.config.mjs` | `read` + `rg "exclude"` ; verify `build` does not typecheck reference dirs |
| `DATABASE_URL` throws at import; no hard-coded URL | `src/db/index.ts`, `drizzle.config.ts` | `read` both; `bash: rg "DATABASE_URL" src/db/index.ts`; check `drizzle.config.ts` uses `dotenv/config` and throws on empty |
| `NVIDIA_API_KEY` server-only, 503 path | `src/app/api/chat/route.ts`, `src/lib/validation.ts` | `read` route 503 branch; `rg "NEXT_PUBLIC"` src/ |
| Tailwind v4 CSS-first, no `tailwind.config.js`, tokens in `globals.css` | `postcss.config.mjs`, `src/app/globals.css`, `src/app/workspace-polish.css`, `src/app/layout.tsx` | `fd tailwind.config` (expect 0); `read` globals for `--mint` palette; verify import order in layout |
| CSP + HSTS + COOP/CORP in `next.config.ts` | `next.config.ts` | `read` CSP array (script-src analytics origins, img-src data:, etc.), `poweredByHeader:false`, headers() block; `od -c` for bracket sequences if disputed |
| `docker-compose.yml` loopback `127.0.0.1:5433` | `docker-compose.yml` | `read` ports line; `bash: grep 127.0.0.1` |

#### B. Route & lib alignment (the critical path)
| Claim | File(s) | Probe |
|-------|---------|-------|
| `POST /api/chat` 5-stage pipeline (origin→session→zod→lease→upsert→fetch→SSE→persist→SSE) | `src/app/api/chat/route.ts` | `read` full file (done); verify: `assertOrigin` first, `chatInputSchema` parse, magic-byte branch, `UPDATE … WHERE busyUntil < now AND lastRequest < now-3000`, `deriveTitle`, `maxDuration 600`, `AbortSignal.any`, 175/590 timeout, `: keep-alive` every 15s via `startKeepAlive(…,15000)`, `providerChunkSchema`, 1.2M size guard, `reasoning_content` stripped on read, `WorkspaceRequestError` branching |
| Keepalive comment frames ignored by parser | `src/lib/keepalive.ts`, `src/lib/sse.ts`, `tests/heartbeat.test.mjs` | `read` all three; verify `RangeError` on 1–600_000, idempotent stop, `sse.ts` ignores non-`data:` lines; check browser constructs `new SSEParser(8_000_000)` in `chat-workspace.tsx` |
| Same-origin gate pure | `src/lib/origin.ts`, `src/lib/server.ts` (`assertOrigin`, `ensureSession`) | `read` origin.ts (no Next/DB imports); verify Host OR first x-forwarded-host, sec-fetch-site, scheme checks; `tests/origin.test.mjs` 7 cases |
| Bounded body 3 MB → 413; 2 MB image via magic bytes | `src/lib/server.ts` `readJson`, route image branch | `read` 3_000_000 default; verify PNG/JPEG/WEBP magic constants; check `imageSchema` 2.8M pre-cap in `validation.ts` |
| Limits server-enforced: 60 msgs, 100 convs, 16k chars, 1.2M response, 16 MB history | `validation.ts`, `route.ts`, `src/lib/title.ts` | `read` schemas (`.max(16000)`, `.max(100)` for rename); `rg "60"` & `16_000_000` in route; `title.ts` dual cap 70 code points + 100 UTF-16 units + `trim()` |
| Throttle `?q=` 10/10s/session, process-local, entry-capped | `src/lib/throttle.ts`, `src/app/api/conversations/route.ts` | `read` throttle (RangeError config, injectable clock, maxEntries); verify route wires limiter only on `?q=` path; `tests/throttle.test.mjs` 8 cases |
| `errorResponse` cache-control + abort taxonomy | `src/lib/server.ts`, `src/lib/stream-abort.ts` | `read` errorResponse sets `Cache-Control: no-store` on 401/403/4xx/500; verify `streamAbortKind` covers ResponseAborted/AbortError/ECONNRESET + `streamAbortLog`/`abortErrorLog` shapes; `tests/core.test.mjs` log shapers |
| Reasoning persisted but stripped from browser | `route.ts` (insert includes reasoning, done event strips), `src/app/api/conversations/[id]/route.ts` | `read` GET mapper removes `reasoning`; verify `types.ts` `ChatMessage` has optional `reasoning` |

#### C. DB & scripts
| Claim | File(s) | Probe |
|-------|---------|-------|
| Drizzle schema: `chat_sessions` (id, last_request, busy_until) + `conversations` (uuid, owner FK cascade, jsonb messages, title) + `pgcrypto`+`pg_trgm` | `src/db/schema.ts`, `drizzle/0000_flimsy_sage.sql`, `infrastructure/postgres/init/00-create-extensions.sql` | `read` all three; verify `index conversations_owner_updated_idx` |
| Lifecycle `db:generate → db:migrate → db:seed → db:setup` | `package.json` scripts, `scripts/migrate.mjs`, `scripts/seed.mjs`, `scripts/db-setup.mjs`, `drizzle/meta/_journal.json` | `read` wrappers for preflight `select 1` + curated ECONNREFUSED + post log `{hash,sessions}` |
| Retention `retention.ts` pure (injected db/tables) + `prune-expired.mjs` | `src/lib/retention.ts`, `scripts/prune-expired.mjs` | `read` positional `(db,tables,options)` signature, no relative imports |

#### D. Components & styling
| Claim | File(s) | Probe |
|-------|---------|-------|
| Workspace shell state machine + WorkspaceRequestError boundary covering send/open/mutate + search binding `{term,items,failed}` | `src/components/chat-workspace.tsx` | `read` (~1k lines) — verify `apiJson`/`parseOrReload` zod validation, `WorkspaceRequestError` class, `mutateConversation` toast, deferred `setBusy(false)` via `setTimeout 0`, `SSEParser(8_000_000)`, search effect term binding |
| Markdown GFM + highlight memo | `src/components/markdown-message.tsx`, `src/lib/markdown.ts` | `read`; verify `memo`, `getNodeText`, highlight.js theme in `globals.css` |
| Lightbox & navigation frame | `src/components/image-lightbox.tsx`, `src/components/navigation-frame.tsx` | `read`; verify Radix dialog, focus trap/restore, `.sidebar-close` |
| Editorial mint layer import order | `src/app/layout.tsx` | `read`; verify `globals.css` before `workspace-polish.css`; note position-only welcome animation |

#### E. Testing & CI
| Claim | File(s) | Probe |
|-------|---------|-------|
| Unit: 55 total (core 41 + heartbeat 6 + throttle 8 + stream-limit) | `tests/*.test.mjs`, `package.json` test script | `bash: npm test` + count; `read` each test file header |
| E2E: 34 local (workspace 13 + stream-ui 12 + recovery + network-recovery + throttle) | `tests/workspace.spec.ts`, `tests/stream-ui.spec.ts`, `tests/recovery.spec.ts`, `tests/network-recovery.spec.ts`, `playwright.config.ts` | `bash: npx playwright test --list` ; `read` playwright.config reuseExistingServer + 60s timeout |
| Live E2E env-gated | `tests/live-site.spec.ts` | `read` skips when `LIVE_SITE_URL` unset; verify 12 tests including provider round-trip with nonce persistence + cleanup |
| CI gates | `.github/workflows/ci.yml` | `read`; verify secret scan excludes `skills/ sample-build/ docs`, order typecheck→lint→unit→build→audit→E2E with Postgres service |
| WCAG & alert scoping rules | `tests/*.spec.ts` | `rg "getByRole.*alert"` (expect 0 unscoped); `rg "\\.error-banner"`; axe checks on welcome/dialogs/error state |

#### F. Security, keys, deployment
| Claim | File(s) | Probe |
|-------|---------|-------|
| Operational debt: `docs/ssh-key.txt` history + `.env` history (both pending rotation) | `docs/CODE_REVIEW_REPORT.md`, `git log --all --oneline -- docs/ssh-key.txt`, `git log --all --oneline --diff-filter=A -- .env` | `bash: git log` + `git ls-files` (`.env` untracked) + `git grep nvapi` over tracked files |
| Session cookie flags: HttpOnly + SameSite=Strict + Secure over https + SHA-256 owner | `src/lib/server.ts` `setSession`/`sessionId` | `read` flags; verify `createHash("sha256")` |
| Structured logs never leak PII | `src/lib/server.ts`, `src/app/api/chat/route.ts` | `rg "console\\.(error|warn)" src/` — verify only operation/ids/errorType |
| Ingress convention `x-forwarded-host` / `Host` preservation | `README.md` troubleshooting + `src/lib/origin.ts` | Cross-check doc claim vs code comment |

---

## 4. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `DATABASE_URL` missing → every route throws at import, E2E cannot run | High (local cold-start) | Blocks DB-backed verification | Validate via `docker compose ps` + `curl /api/health` first; offer `npm run db:setup` cold-start path; never run `down -v` without explicit consent |
| E2E flakiness (port 3000 busy, reuseExistingServer) | Med | False failure | Follow CLAUDE.md: use `PORT=3004` + `TEST_BASE_URL=http://localhost:3004` fallback |
| Live E2E against production without `LIVE_SITE_URL` | Low | Skipped silently | Document as "skipped — not a failure"; run supplemental `curl` probes for health/headers instead |
| Terminal rendering swallowing `[m` again (CSP/CI trigger disputes) | Med | Phantom findings | Byte-safe `od -c` / scripted checks for any bracket claim |
| Scope creep into fixes | Med | Violates Meticulous Approach | Plan explicitly has no code edits; drift list is advisory only until second approval |

---

## 5. Non-Goals (explicitly out of scope for this validation)

- No feature work, no prompt/UX redesign, no dependency upgrades.
- No history rewrite for exposed keys (operator decision).
- No ingress or secret rotation — report only.
- No Lighthouse re-baseline unless requested (deferred I5 from pass 7).

---

## 6. Deliverables & Success Criteria

**Deliverable A — Handoff doc:** `docs/VALIDATION_HANDOFF_<date>.md` containing:
  1. Claim inventory table (doc line → evidence → aligned/drift)
  2. Probe evidence ledger (command + hash of output)
  3. Gate results (`typecheck`/`lint`/`unit`/`build`/`e2e` with counts)
  4. Live probe results (if `LIVE_SITE_URL` set) or `curl /api/health` local
  5. Severity-ranked drift list (Critical/High/Med/Low/Info) with proposed doc deltas

**Success criteria:** Every section of AGENTS / CLAUDE / README has a corresponding evidence row; zero un-probed claims; `typecheck → lint → test → build` green; current status statement matches `docs/CODE_REVIEW_REPORT.md` pass 9 ledger within tolerance; no gate weakened.

---

## 7. Estimated Effort & Timeline

| Phase | Wall time | Notes |
|-------|-----------|-------|
| ANALYZE | done (reconnaissance) | 3 docs + 10-file skim already performed to make this plan accurate |
| PLAN | done (this doc) | Awaiting VALIDATE gate |
| VALIDATE | 5 min | User confirmation + scope tweaks |
| IMPLEMENT (alignment sweep) | 45–60 min | ~40 probes (reads + greps + curl) |
| VERIFY (gates) | 15–25 min | typecheck/lint/unit are fast; build + db:setup + E2E dominate |
| DELIVER | 15 min | Handoff + drift table |

---

## 8. Explicit Validation Request

> **This plan proposes no file writes beyond this planning doc itself.**
> The next step is **your explicit approval** to enter Phase 4 (IMPLEMENT — alignment sweep + gate runs).
>
> Options:
> - ✅ **Approve as written** — I will execute Phases 4–6 verbatim and report evidence, not claims.
> - ✏️ **Approve with modifications** — tell me what to add/remove (e.g., skip E2E, skip live probes, add a focus area).
> - 🛑 **Revise the plan** — tell me which section needs more depth before proceeding.

---

## Appendix — Quick Reconnaissance Already Performed (to make this plan precise)

- Read `AGENTS.md` (116 lines), `CLAUDE.md` (brief & practical), `README.md` (498 lines) in full.
- Read `docs/CODE_REVIEW_REPORT.md` (630+ lines, passes 3–7 ledger), `src/db/schema.ts`, `src/app/api/chat/route.ts` (390 lines), `src/lib/server.ts`, `src/lib/validation.ts`, `drizzle.config.ts`, `next.config.ts` (CSP analytics origins), `docker-compose.yml` (127.0.0.1:5433), `package.json` scripts, `playwright.config.ts`, `.env.example`, `git log -20`.
- Confirmed `next.config.ts` CSP baseline already matches pass-9 (analytics origins present), `poweredByHeader:false`, COOP/CORP `same-origin`, `docker-compose.yml` loopback-only — all aligned with README's recent-changes table.
- This plan is therefore **grounded in actual file contents**, not doc prose alone. Full sweep still pending your go-ahead.
