# Remediation Plan — 2026-09-12 (pass 9)

Tiered audit (pass 9) findings → actionable ToDo list. Every item validated
against the codebase before planning the fix; statuses update as work lands.
Companion: `docs/CODE_REVIEW_REPORT.md` (pass 9 section), `remediation-plan-2026-09-11.md`
(previous pass — all its code-level items remain closed; operator items carried).

## Findings → ToDo

| ID | Finding (severity, confidence) | Root cause | Fix | Tests (TDD) | Status |
|----|-------------------------------|-----------|-----|-------------|--------|
| R1 | **M-1** Unthrottled `?q=` search = resource amplification (Verified: 100 convs × 16 MB image JSONB → 2.3–2.8 s DB CPU + ~1.6 GB TOAST reads per search; 8 concurrent = 18.7 s wall; ~30–60 min scripted seeding prerequisite) | `GET /api/conversations` accepts unbounded search frequency per session; the JSONB expansion cost is intrinsic to the storage shape | Per-session sliding-window rate limit on the `?q=` path only (plain list stays free): `src/lib/throttle.ts` pure limiter (10 searches / 10 s / session, module-level, entry-capped) wired in the conversations route; 429 with curated copy → client already degrades to local-title search behind the retryable notice (tested in `recovery.spec.ts`) | Unit: limiter burst/slide/independence/entry-cap/RangeError; API E2E: 11 rapid `?q=` requests → some 429, plain list unaffected | ✅ done |
| R2 | **L-1** docker-compose publishes PostgreSQL on all interfaces with repo-published credentials (Verified) | `ports: "5433:5432"` binds 0.0.0.0 | Bind loopback: `127.0.0.1:5433:5432` (matches the documented `127.0.0.1:5433` URL) | Inspection + docs already state 127.0.0.1; cold-start flow unchanged | ✅ done |
| R3 | **L-2** keep-alive beat `controller.enqueue` can throw on an errored (non-canceled) stream teardown → uncaught timer exception (Reasoned) | Beat body guards only `aborter.signal.aborted`; `send()` has an inner try/catch, the beat does not | Wrap the beat enqueue in try/catch mirroring the `send` guard | Existing keep-alive unit/E2E coverage unchanged; path is defensive-only | ✅ done |
| R4 | **S4** heartbeat "fires repeatedly" test can flake under event-loop starvation (Reasoned) | Fixed 40 ms sleep + `>= 3` beats assumes a healthy loop | Poll-until-N-beats-with-deadline; make the stop test non-vacuous by first waiting for ≥ 1 beat | The tests themselves | ✅ done |
| R5 | **I-B** `errorResponse` omits `Cache-Control: no-store` on error JSON (Verified; defense-in-depth) | Success paths set it explicitly; the error funnel does not | Add the header in both `errorResponse` branches | Assert `cache-control: no-store` on the existing 400 malformed-input API response in `workspace.spec.ts` | ✅ done |
| R6 | **S5** new stream-ui comment-frame test hand-rolls JSON data frames (cosmetic duplication) | `sse()` helper cannot emit comment frames, so the whole body was hand-written | Compose data frames via `sse([...])` and interleave only the comment frames by hand | Existing assertions unchanged | ✅ done |
| R7 | **D1/D2/D3** doc drift: PAD + `new-chat_SKILL.md` missing keepalive/CSP-origins/47-33 counts; README:202 "Latest verification" stale (Verified) | Session commits updated AGENTS/CLAUDE/README only | Sync all three: CSP string with cloudflareinsights origins, unit 47 → (post-R1) new count, local E2E 33 → new count, `src/lib/keepalive.ts` + `src/lib/throttle.ts` inventory, keep-alive in request path, README status paragraph refreshed to pass 9 | Contract re-check (spot) after edits | ✅ done |
| A2 | **GAP C** live provider fetch hangs > 200 s after `meta` (changed from pass-8's fast 401/403; `configured: true`) — operator-side, cannot be distinguished from outside (key state vs NVIDIA service vs egress) | Deployment credential/service, not app code | Operator: verify/rotate `NVIDIA_API_KEY`, check NVIDIA NIM status for `moonshotai/kimi-k3`, verify server egress; re-run live suite after (keep-alive now preserves the connection so the route's curated timeout error reaches the browser) | `LIVE_SITE_URL=… npx playwright test tests/live-site.spec.ts` | OPEN (operator) |
| B1 | **Backlog (from M-1)** indexed server-side search | `jsonb_array_elements` per-row expansion is intrinsic to the storage shape | Deeper fix: generated `search_text` column + `pg_trgm` GIN index (extension already installed) via a schema migration — removes the per-query CPU cost instead of bounding it. Deliberately deferred: schema change + migration discipline; throttle bounds the scriptable surface meanwhile | New migration + query plan test | BACKLOG |
| — | Carried operator items unchanged: C1 (rotate SSH key in history), C2 (rotate NVIDIA keys in history), I6 (retention cron), I3 residue (nonce CSP at deploy time), M3 (ingress rate limiting), M4 (dev-only esbuild advisories) | — | See `docs/CODE_REVIEW_REPORT.md` pass 9 carried table | — | OPEN (operator) |

## Execution order

1. R1 (TDD: unit red → lib green → route wiring → API E2E red → green).
2. R3 + R4 + R6 + R5 (small hardening batch, each with its own verification).
3. R2 (compose binding).
4. Full gates: typecheck → lint → unit → build → local E2E.
5. R7 doc sync (PAD, new-chat_SKILL.md, README status, AGENTS/CLAUDE additions for the throttle + no-store contract).
6. Pass 9 report appended to `docs/CODE_REVIEW_REPORT.md`.
7. Atomic commits; live suite re-run; push (operator items remain open by design).
