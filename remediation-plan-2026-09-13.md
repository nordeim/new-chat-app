# Remediation Plan — Session 5 (2026-09-13)

**Inputs:** pass-10 tiered audit (security subagent + contract/standards subagent + mechanical scans).
**Scope:** all findings are code-level or documentation; operator items (key rotations C1/C2, prune cron I6, nonce CSP I3 residue, ingress-level rate limiting, M4 dev-only esbuild advisories) remain carried by their documented dispositions.
**Method:** TDD (red → green) for every behavioral change; characterization assertions for semantic pins; full gate chain after each batch; documentation sync before commit.

## Findings summary (from the pass-10 audit)

| ID | Severity | Source | Finding |
|----|----------|--------|---------|
| F-1 | Low | security | `clientNetworkKey` trusts the FIRST `x-forwarded-for` value — spoofable: forged unique XFF values bypass the mint throttle (reproduced 500/500 allowed); forged shared values poison another network's bucket |
| F-2 | Low | security | Unvalidated XFF key strings + no time-based eviction — ~160 MB retained key memory from a bounded 10k-entry flood (measured 76 MB at 8k-char keys) |
| H-1 | High (docs) | contract | 38+ stale/false sentences across AGENTS/CLAUDE/README/SKILL + PAD after the session's code changes (search mechanics, test counts 34→38, migration count/hash, throttle wiring, lease ordering, mint limit) |
| M-1 | Medium | contract | Mint-throttle flood test fires 80 SERIAL requests — a slow runner stretching past the 10 s window erodes the throttled count below the ≥5 assertion (flakiness margin) |
| M-2 | Medium | both | `src/lib/throttle.ts` module header says "wired for the `?q=` path only" — now two call sites (search + session mint) |
| M-3 | Medium | contract | B1 write-path/storage tradeoff (content-text copy + trigram index; ACCESS EXCLUSIVE backfill lock) — documented tradeoff, needs one report/runbook note |
| L-1 | Low | both | `?q=` terms containing a literal newline can match across the title/content join boundary (old per-field semantics could not) — verified with a rolled-back probe |
| L-2 | Low | security | Retry within 3 s after a missing-key 503 now sees 429 "sent too quickly" (lease stamps `lastRequest` before the key check) — verified no documented contract pins the old precedence; needs a doc sentence |
| L-3 | Low | contract | `npx drizzle-kit push` (documented prototyping path) fails on a cold DB — the generated-column expression references `messages_content_text`, which exists only in migration 0001 |
| L-4 | Low | contract | Flood test cleanup deletes ALL empty sessions (global state); precise owner-addressed cleanup is possible |
| L-5 | Low | contract | Missing blank line between `clientNetworkKey` and `ApiError` in `src/lib/server.ts` |
| L-6 | Low | contract | SKILL footer still says v1.2 / 41/41 / 32 local while the header says v1.4 |

## Remediation items (execution order)

- **R1 (F-1, F-2) — harden the mint key derivation.** Extract a pure `clientNetworkKey(cfConnectingIp, xForwardedFor)` into `src/lib/client-key.ts` (pure module so the node:test suite can import it — `server.ts` cannot be unit-imported because it pulls `@/db`, which throws without `DATABASE_URL` and the CI gates job has none). Key priority: validated `cf-connecting-ip` (the documented Cloudflare ingress sets it and overwrites client-supplied values) → validated RIGHTMOST `x-forwarded-for` value (the position appended by the nearest trusted proxy; the first value is client-controlled and stays untrusted) → `"direct"`. Values must parse as IPv4/IPv6 (bounded to 45 chars, killing F-2's byte retention; non-IP shapes fall through to the next source). RED: unit tests for spoofing (fake first XFF ignored), poisoning (rightmost wins), validation (hostname-shaped values rejected), fallback chain. GREEN: implement + rewire `server.ts`. Behind the documented ingress the key becomes trustworthy; direct/dev spoofing remains possible and is documented as accepted (same trusted-ingress convention as `x-forwarded-host`).
- **R2 (M-1) — flood-test concurrency.** Fire the 80 cookieless requests via `Promise.all` so the whole flood lands well inside the 10 s window on any runner; assertions unchanged.
- **R5 (L-1) — term whitespace normalization.** Collapse whitespace runs in the `?q=` term to single spaces server-side (`term.replace(/\s+/g, " ")`) — a newline-containing term can then never span the `\n` join boundaries, restoring the old per-field semantics while following the repo's `deriveTitle` whitespace-collapse philosophy. RED: extend the B1 E2E test with a newline-span must-not-match assertion. GREEN: route change.
- **R4 (L-3) — migration + push-path robustness.** The 0001 migration is uncommitted and only locally applied, so: switch to `CREATE OR REPLACE FUNCTION` in the migration, add the same function creation to `infrastructure/postgres/init/00-create-extensions.sql` (fresh volumes then satisfy `npx drizzle-kit push`), reset the local 0001 application (drop index/column/function + journal row), and re-apply the edited migration cleanly.
- **R6 (L-4) — precise flood cleanup.** Capture each minted session's cookie during the flood (the context holds it immediately after each response) and delete those owner rows in `finally` — no global empty-session sweep.
- **R3+R7+L-6 (M-2, F-6, L-5) — stale headers and formatting.** Generalize the `throttle.ts` header to both call sites; refresh the `throttle.test.mjs` header rationale; add the missing blank line; fix the SKILL footer version (doc pass).
- **R8 (H-1) — the documentation pass.** Fix every sentence in the exhaustive drift list (AGENTS:42/44/51/60/75 + lease-order note; CLAUDE:73/95/141/142/189/196/202; README:70/172/196/202×2/207 + 4 new change-table rows; SKILL:4/6/76/86/91/122/279/392/458/611/621-624/968/970/1005/1027/1031/1035/1046) plus the PAD appendix lines; add the pass-10 section to `docs/CODE_REVIEW_REPORT.md` (findings table above + verification ledger + M-3 deploy note + L-2 behavior note); record the two orphaned exploratory conversations from the first live pass.
- **Deferred (operator, unchanged):** C1/C2 key rotations, I6 prune cron, I3-residue nonce CSP, ingress-level rate limiting, M4 dev-only advisories.

## Validation plan

1. Every RED test is observed failing before its implementation (worklog evidence).
2. After each batch: `npm run typecheck` → `npm run lint` → `npm test` → `npm run build` → full local E2E (`38`+ tests).
3. After R4: `npm run db:migrate` re-applies 0001 cleanly; `db:setup` on a fresh scratch database applies 2 migrations + seed; the B1 test stays green.
4. After R8: re-run the drift check (grep for the stale claims — zero hits) before committing.
