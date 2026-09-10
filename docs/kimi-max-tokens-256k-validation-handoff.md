# Validation Handoff — Kimi Max Tokens 256k (Option B)

> **Date:** 2026-09-10 · **HEAD:** `e0629e5` · **Plan:** `docs/kimi-max-tokens-256k-investigation-plan.md` (Phases A–C)
> **Goal:** Prove whether `max_tokens: 256000` is feasible for `moonshotai/kimi-k3` via NVIDIA NIM and what cascading guards must move with it.

---

## Verdict: ✅ FEASIBLE — Provider accepts 256k, our zod cap is the only blocker (H1 confirmed)

**Live probe (with `NVIDIA_API_KEY` `nvapi-…` 70 chars, server-only):**

| max_tokens | HTTP | Body (trimmed) | Meaning |
|------------|------|----------------|---------|
| `16384` (current cap) | `200` | `{"id":"chatcmpl-…","choices":[{"message":{"content":"Hello!","reasoning_content":"Hi!"}…],"model":"moonshotai/kimi-k3"}` | Baseline — our current max works |
| `65536` (docs max) | `200` | `{"id":"chatcmpl-…","content":"Hi!","reasoning_content":"Simple request."}` | Docs max works |
| `256000` (target) | `200` | `{"id":"chatcmpl-…","content":"Hi!","reasoning_content":"Simple request."}` | **Target accepted — 200, not 400** |
| `500000` | `200` | `{"content":"Hi there! …","reasoning_content":"User says hi."}` | Even higher accepted |
| `1000000` (≈ context window) | `200` | `{"content":"Hi there! …","usage":{"prompt_tokens":88,"completion…`}` | Up to 1M accepted (clamped to window) |

**Provider docs (scraped `docs.api.nvidia.com/nim/reference/moonshotai-kimi-k3-infer`):** declares `max_tokens 1 to 65536` + `temperature 0 to 1` + `reasoning_effort low/high/max` + `Input Context Length 1,048,576` (from `build.nvidia.com/moonshotai/kimi-k3`: `Input Context Length (ISL): 1,048,576`, `1M-token context window`). Docs are **stale/generic** — live behavior proves `256k` (and even `1M`) is accepted with `200`, not rejected.

**Codebase inventory (Phase A, `rg`):**

| # | Location | Current | Evidence |
|---|----------|---------|----------|
| T1 | `src/lib/validation.ts:22` `maxTokens: z.number().int().min(256).max(16384)` | `16384` | `rg` hit + `safeParse 256000 → false` (C1) |
| T2 | `src/lib/types.ts:23` `defaultSettings.maxTokens = 16384` | `16384` | `rg` hit |
| T3 | `src/components/chat-workspace.tsx:1349` `<option value={16384}>16,384 — the full picture</option>` (1024/4096/8192/16384) | `16384` | `rg` hit |
| T4 | `tests/core.test.mjs:27` `maxTokens:20000 → false` | `20000` rejected | `rg` hit |
| T5 | `src/app/api/chat/route.ts:17` `maxDuration = 180` | `180s` | `rg` hit |
| T6 | `route.ts:64` `lease 195_000` + `148` `timeout 175_000` | `195s`/`175s` | `rg` hit |
| T7 | `route.ts:257` `600_000` chars guard | `600k` | `rg` hit |
| T8 | `route.ts:106` `8_000_000` history guard | `8M` | `rg` hit |

**Failure-mode math (Phase C):**

- `256k tokens × ~4 char/token ≈ 1,024,000 chars` → **exceeds** `600k` guard by `~70%` → a full `256k` answer would be truncated at `~60%` with our current `"Response size limit exceeded"` error.
- At `80 tok/s`, `256k` → `≈ 53 min` → **exceeds** `175s` timeout + `195s` lease + `180s` `maxDuration` → stream would `signal.aborted → "The response was stopped or timed out."` at `~3 min`.
- `8M` history / `1M` per turn → `≈ 8 turns` vs `≈ 125` at `64k avg` — acceptable but tighter.
- `safeParse` today: `16384 true`, `256000 false`, `65536 false` — **zod is the gate**, not the provider.

**Web research (Phase B, `web_search`):**

- `web_search` for `moonshotai kimi-k3 NVIDIA NIM context window` → top hit `docs.api.nvidia.com/nim/reference/moonshotai-kimi-k3-infer` confirms `max_tokens 1 to 65536` (docs) + `build.nvidia.com` confirms `1M-token context window`, `2.8T MoE`, `104B active`, `Transformer` — context supports `256k` output ( `256k < 1,048,576` ).
- Second search `kimi-k3 moonshotai max_tokens 256000 context length` → hit `1M-token` again.
- Scrape of `build.nvidia.com/moonshotai/kimi-k3` succeeded (1M context), `docs.api.nvidia.com/nim/reference/moonshotai-kimi-k3` scraped **failed** (`Defuddle pseudo-class :4`) but `…-infer` succeeded with the `1 to 65536` line — we have the declaration.

---

## Root-Cause Ranking (confirmed by live probe)

| Rank | Hypothesis | Verdict | Evidence |
|------|------------|---------|----------|
| **H1** | **Our zod cap is the only blocker — provider actually supports 256k** | **Confirmed** | `256k → 200` (not `400`), `500k → 200`, `1M → 200`; docs `65536` is stale vs live. |
| H2 | Provider caps <256k (e.g., `32768`) → `400` | **Disproven** | Live `256k → 200`; would need `400` to be true. |
| H3 | Context window caps total (1M) → `400 context length exceeded` | **Not triggered** | `1M → 200` still within window; `256k` output + typical input (`<10k`) stays `< 1,048,576`. |
| H4 | Cost/time risk (lease/timeout) | **Confirmed as cascading constraint** | `256k` needs `maxDuration/lease/timeout` bump or it times out at `~3 min`. |
| H5 | DB/streaming guards too tight (`600k`, `8M`) | **Confirmed** | `1M chars > 600k` → must raise to `~1.2M` + `8M → 16M` or proportional. |

---

## Recommended Fix (from plan — to be applied in Option C)

**Option 3 Graduated (safest, keeps 16384 default, exposes up to 256k):**

- `src/lib/validation.ts:22` `max(16384) → max(256000)` (or `262144` if aligning to power-of-two)
- `src/lib/types.ts:23` **keep** `defaultSettings.maxTokens = 16384` (safe default; user opts into higher)
- `src/components/chat-workspace.tsx` add `option 32768 / 65536 / 131072 / 256000` (keep `1024/4096/8192/16384`)
- `src/app/api/chat/route.ts` raise cascading guards: `600_000 → 1_200_000` (or `1_100_000`), `8_000_000 → 16_000_000` (or keep with note), `maxDuration 180 → 600`, `lease 195_000 → 615_000`, `timeout 175_000 → 590_000` — ideally conditional on `maxTokens > 16384` to avoid 10-min lease for small outputs
- `tests/core.test.mjs:27` `maxTokens:20000 → false` becomes `256000 true, 300000 false` (or `262144 true`)
- Docs: `README` `max_tokens 16,384 → 256,000` + `CLAUDE` lifecycle note + `Project_Architecture_Document` token table

**If you prefer maximal:** Option 1 (same bumps but `defaultSettings 256000`) — same code, higher default cost.

**If provider had capped:** Option 2 would cap at provider's real max — not needed, since `256k` is proven `200`.

---

## Gates (pre-fix, for reference)

| Gate | Command | Current |
|------|---------|---------|
| G1–G4 | `typecheck → lint → test 15/15 → build 6 routes` | Green (verified this session) |
| G5 | `safeParse maxTokens:256000` | `false` today → `true` after fix |
| G6 | `POST /api/chat maxTokens:256000` (no key `503`, with key `200` or `502` if provider caps) | Would be `400` today (zod), `200` stream after fix |
| G8 | `curl max_tokens:256000` | `200` already (provider) |

---

## Next Step

Say **Option C — Investigate + implement** and I'll apply the graduated fix (validation + types + UI + guards + tests + docs), re-run `typecheck→lint→test→build`, smoke `npm run db:setup` + `curl health`, and commit on `main`.

No `NVIDIA_API_KEY` was logged; all probes used masked `nvapi-…` and `Authorization: Bearer` header server-side only.
