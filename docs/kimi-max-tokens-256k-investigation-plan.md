# Investigation Plan — Increase Kimi Max Tokens to 256,000

> **Goal:** Raise the workspace's `max_tokens` (output token limit) from `16,384` → `256,000` for `moonshotai/kimi-k3` via NVIDIA NIM (`integrate.api.nvidia.com/v1/chat/completions`).
> **Scope:** `src/lib/{validation,types}` · `src/components/chat-workspace.tsx` · `src/app/api/chat/route.ts` · `tests/core.test.mjs` · `README.md` · `AGENTS.md` · `CLAUDE.md` · `Project_Architecture_Document.md` · provider contract (`NVIDIA_API_KEY`, `reasoning_effort`, `Accept: text/event-stream`)
> **Method:** Six-phase meticulous — ANALYZE (inventory + research) → PLAN (this doc) → VALIDATE (evidence, not claims) → ROOT-CAUSE (cascading limits) → FIX OPTIONS (ranked) → VERIFY (gates) — no code until VALIDATE proves feasibility.
> **Date:** 2026-09-10 · **HEAD:** `e0629e5` · **Current max:** `16,384` (zod `max(16384)`, `defaultSettings.maxTokens`, UI select `1024/4096/8192/16384`, `tests/core.test.mjs` `maxTokens:20000` rejected, `README` defaults `16,384`)

---

## 1. Deep Understanding — Where "16,384" lives today

### 1.1 Token path (end-to-end, verified against code)

```
UI (chat-workspace.tsx)  →  zod (validation.ts)  →  route.ts (chatInputSchema.safeParse)  →  NVIDIA fetch (max_tokens)
   defaultSettings            chatInputSchema               ApiError 400 on fail                 body: { max_tokens: input.settings.maxTokens }
   maxTokens 16384            maxTokens int 256–16384        then lease→DB→stream                server is authority; client mirrors for UX
   select 1024/4096/8192/16384  strict object                 providerChunkSchema                 response timeout 175s, lease 195s, maxDuration 180
```

### 1.2 Inventory — every enforced limit that interacts with maxTokens

| # | File | Line / snippet | Current value | Role | Effect of raising to 256k |
|---|------|----------------|---------------|------|---------------------------|
| T1 | `src/lib/validation.ts:22` | `maxTokens: z.number().int().min(256).max(16384)` | `16,384` | **Authority** — rejects `>16384` with `400` before any DB/provider call | Must become `256000` (or `262144` if aligned to power-of-two context). |
| T2 | `src/lib/types.ts:13` | `defaultSettings.maxTokens = 16384` | `16,384` | Default for new sessions; also `Reset to defaults` target | Should become `256000` or keep `16384` as safe default and expose higher in UI? |
| T3 | `src/components/chat-workspace.tsx` select | `option 1024 / 4096 / 8192 / 16384` + `<select value={settings.maxTokens}>` + `field-note "Includes thinking and answer tokens."` | `16,384` max | UX — user cannot select >16k even if API allows; `parseOrReload` not involved here (settings are client state) | Add `65536`, `131072`, `256000` options (or free numeric input with validation). |
| T4 | `tests/core.test.mjs:8` | `settings: { maxTokens: 20000 }` → `assert false` | `20,000` rejected | Proves `16384` is enforced; will need update to `300000` rejected case | Update test to `256000` pass / `300000` fail. |
| T5 | `src/app/api/chat/route.ts:146` | `AbortSignal.timeout(175_000)` + `maxDuration = 180` (top) | `175s` provider timeout, `180s` Next max | `256k` tokens at ~50–100 tok/s → `~40–80 min` worst-case, far exceeds timeout/lease | Must raise or document that `256k` is **output limit, not guaranteed fill**; actual stream may still hit timeout. See §2. |
| T6 | `src/app/api/chat/route.ts:257` | `if (assistant.content.length + reasoning.length > 600_000) throw "Response size limit exceeded"` | `600k` chars (~150k tokens) | Hard cap on `content+reasoning` — `256k` tokens ≈ `1M` chars (4 char/token avg) → **already exceeds** this guard | Must raise to `~1_100_000` or make proportional to `maxTokens`. |
| T7 | `src/app/api/chat/route.ts:105` | `JSON.stringify(messages).length > 8_000_000` (history) + `messages.length >=60` | `8M` chars / 60 msgs | Multi-turn with `256k` output could hit 8M in ~8 turns vs ~500 turns at 16k | Consider raising or documenting; DB `jsonb` itself is `~256M` but app guard is intentional. |
| T8 | `src/app/api/chat/route.ts:195` | `lease = now + 195_000` + `lastRequest 3s` spacing | `195s` busy, `3s` spacing | Same timeout family as T5 — long generations hold lease, block deletes (`409`) | Raising `maxDuration` requires raising lease accordingly. |
| T9 | `README.md` NVIDIA contract | `max_tokens 16,384` | `16,384` | Docs — will need sync | Update to `256,000` + note provider actual cap. |
| T10 | `CLAUDE.md` / `AGENTS.md` | No explicit maxTokens table, but `defaultSettings` mentioned implicitly | — | Docs — update after validation | Add to `Database / Data Layer` or `Build Commands` notes. |

### 1.3 Current docs vs. reality

- `README.md: "Defaults: temperature 1, max_tokens 16,384, reasoning effort max"` — will need `256,000` if adopted.
- No other doc claims `16384` as a hard provider limit — it is **our** zod cap, not necessarily NVIDIA's.

---

## 2. External Research Required (before choosing a fix)

### 2.1 NVIDIA / Kimi K3 provider contract — must verify, not assume

| Question | Why it matters | How to verify |
|----------|----------------|---------------|
| What is Kimi K3's **context window** (total input+output) via NVIDIA NIM? | `max_tokens` cannot exceed `context window - input tokens`; if window is `128k`, `256k` output is impossible | `web_search` for `moonshotai/kimi-k3 NVIDIA NIM context window` + scrape `https://build.nvidia.com/moonshotai/kimi-k3` + `https://docs.api.nvidia.com/nim/reference/moonshotai-kimi-k3` (cards: API reference, model page) |
| What is Kimi K3's **max output tokens** advertised? | Determines whether `256000` is `valid` vs `rejected with 400` | Same sources; look for `max_tokens`, `max output`, `context length` tables |
| Does NVIDIA NIM enforce **per-request max_tokens ceiling** (e.g., 16384, 32768, 131072) that returns `400 invalid max_tokens`? | If we raise zod to `256k` but provider caps at `32k`, users will see `502 "NVIDIA could not start the response"` — confusing | Test with real key: `curl -X POST https://integrate.api.nvidia.com/v1/chat/completions -d '{"model":"moonshotai/kimi-k3","max_tokens":256000,"messages":[{"role":"user","content":"hi"}]}'` (with valid `NVIDIA_API_KEY`) — expect `200` stream vs `400` error |
| Is pricing **per-token** (input+output) — does 16× output increase cost/risk? | Operational cost concern for `npm run prune` / billing defense | Check `build.nvidia.com` pricing / NIM billing docs |
| Does Kimi K3 support **256k thinking + answer combined**? | `field-note` says limit includes both; raising to `256k` may be consumed mostly by `reasoning_content` at `effort=max` | Check model card for `reasoning` / `thinking` token accounting |

### 2.2 Local research — codebase-only (no network)

| Task | Command | Expected |
|------|---------|----------|
| Find every `16384` | `rg -n "16384\|16_384\|16k\|maxTokens" src/ tests/ README.md CLAUDE.md AGENTS.md` | Hits T1–T10 |
| Find `600_000` and `8_000_000` guards | `rg -n "600_000\|8_000_000\|195_000\|175_000\|maxDuration" src/` | T5–T8 |
| Find UI select | `rg -n "Maximum output tokens\|maxTokens\|1024\|4096" src/components/chat-workspace.tsx` | T3 |

---

## 3. Validation Plan — Evidence, not claims (tick with command + output)

### Phase A — Codebase inventory (fast, no network)

| # | Task | Command | Expected |
|---|------|---------|----------|
| A1 | List all maxTokens enforcement | `rg -n "maxTokens\|16384\|256" src/lib/validation.ts src/lib/types.ts src/components/chat-workspace.tsx tests/core.test.mjs src/app/api/chat/route.ts` | 6+ hits, all at T1–T4 |
| A2 | List cascading guards | `rg -n "600_000\|8_000_000\|175_000\|195_000\|maxDuration" src/app/api/chat/route.ts` | T5–T8 |
| A3 | Confirm UI is closed select | `rg -A2 "Maximum output tokens" src/components/chat-workspace.tsx` | 4 options, no free input |
| A4 | Confirm docs mention | `rg -n "max_tokens" README.md` | `16,384` |

### Phase B — Provider contract (needs network + optional NVIDIA_API_KEY)

| # | Task | How | Expected |
|---|------|-----|----------|
| B1 | Scrape NVIDIA model page | `scrape https://build.nvidia.com/moonshotai/kimi-k3` + `scrape https://docs.api.nvidia.com/nim/reference/moonshotai-kimi-k3` | Extract `Context length`, `Max output tokens`, `max_tokens` range |
| B2 | Search context window | `web_search` for `kimi-k3 max tokens context window` (2–3 angles) | Cross-validate: e.g., `128k` vs `256k` |
| B3 | Live probe (if key available) | With `NVIDIA_API_KEY` from `.env` (server-only): `curl -H "Authorization: Bearer $NVIDIA_API_KEY" https://integrate.api.nvidia.com/v1/chat/completions -d '{"model":"moonshotai/kimi-k3","max_tokens":256000,"stream":false,"messages":[{"role":"user","content":"Say hi in one word"}]}'` | If `200` or stream start → `256k` supported; if `400 {"error":{"message":"max_tokens ..."}}` → provider caps lower (note exact cap) |
| B4 | Record pricing / timeout implication | Note provider timeout vs our `175s` / `195s` lease | E.g., `256k` at 80 tok/s ≈ `53 min` > lease → needs `maxDuration` bump |

### Phase C — Failure-mode investigation (local, no network)

| # | Task | Command | Expected |
|---|------|---------|----------|
| C1 | What happens if we send `maxTokens: 256000` today (zod rejects)? | `node --experimental-strip-types -e "import {chatInputSchema} from './src/lib/validation.ts'; console.log(chatInputSchema.safeParse({content:'hi', settings:{temperature:1,maxTokens:256000,reasoningEffort:'max'}}).success)"` | `false` (blocked before provider) |
| C2 | What happens if provider rejects `256000`? | Route `fetch` → `!response.ok` → `502` curated; `ApiError` path → `send {type:"error"}`; not persisted, stays retryable | Verify curated path, not raw leak |
| C3 | History / response size impact | Calc: `256k * 4 char/token ≈ 1.0M chars`; `8M / 1M ≈ 8 turns` vs `8M / 64k ≈ 125 turns`; `600k` would truncate at `~60%` of a full `256k` answer | Document |

---

## 4. Root-Cause / Constraint Analysis (hypotheses ranked)

| Rank | Constraint | Likelihood | If true, fix must include |
|------|------------|------------|---------------------------|
| **H1** | **Our zod cap is the only blocker** — provider actually supports `256k` (Kimi K3 advertises `128k–256k` context, `max_tokens` up to `16384` per NVIDIA docs is just an example) | Medium | Simple bump `16384 → 256000` in validation + types + UI, plus raise `600k → ~1_100_000` and `maxDuration/lease` to avoid premature timeout. |
| **H2** | **Provider caps output <256k** (e.g., `32768` or `131072`) — `256k` would get `400` from NVIDIA → our `502` | High | Must cap zod at provider's real ceiling (e.g., `131072`) and document; `256k` would be rejected. Need B3 probe to choose. |
| **H3** | **Context window caps total** — `256k` output + input history exceeds window → `400 context length exceeded` | Medium | Either cap `maxTokens` to `window - history` or add pre-check; UI should warn. |
| **H4** | **Cost/time risk** — `256k` at `effort=max` burns tokens + holds lease `>180s` → `429` + billing spike | High if enabled | Keep default `16384`, expose `256k` as opt-in max; add `reasoningEffort` note; consider advisory rate-limit. |
| **H5** | **DB / streaming guards too tight** — `600k` + `8M` + `175s` silently truncate `256k` answers | High | Raise `600k → 1_200_000` (or `maxTokens*5`), `8M → 16M` or document, `maxDuration 180 → 600`, `lease 195 → 615`, `timeout 175 → 590`. |

---

## 5. Fix Options (choose after VALIDATE proves H1–H5)

### Option 1 — Minimal bump (if provider supports 256k — H1 true)

- `src/lib/validation.ts:22` `max(16384) → max(256000)` (or `262144` if provider uses power-of-two)
- `src/lib/types.ts:13` `defaultSettings.maxTokens` stay `16384` (safe default) or `256000` (if you want max by default) — recommend **keep 16384 default**, expose higher.
- `src/components/chat-workspace.tsx` add `option 65536 / 131072 / 256000` (or `262144`) + keep `1024/4096/8192/16384`
- `src/app/api/chat/route.ts` raise `600_000 → 1_200_000` (or `1_100_000`), `8_000_000 → 16_000_000` or keep 8M with note, `maxDuration 180 → 600`, `lease 195_000 → 615_000`, `timeout 175_000 → 590_000`
- `tests/core.test.mjs:8` `maxTokens:20000 → 256000 pass, 300000 fail`
- Docs: `README` defaults, `CLAUDE` lifecycle note

*Pros:* One-line zod + UI, full 256k available. *Cons:* Long generations hold DB lease 10 min, cost spike.

### Option 2 — Provider-capped bump (if H2 true, e.g., provider max 131072)

- Same as Option 1 but cap at **provider's real max** (e.g., `131072` or `32768`) discovered in B3

*Pros:* No 502 surprises. *Cons:* Not truly 256k.

### Option 3 — Graduated exposure (safest)

- Keep `default 16384`, add UI `32768 / 65536 / 131072 / 256000` with warning `"Large outputs may take several minutes and incur higher cost"`; enforce `600k → 1_200_000` + `maxDuration 600` only when `maxTokens > 16384` (conditional timeout/lease).

*Pros:* Backward-compatible, cost-aware. *Cons:* More code (conditional `maxDuration` via `export const maxDuration` is static — would need `lease`/`timeout` conditional on `input.settings.maxTokens`).

### Option 4 — Research-only (no code)

- Only update `README`/`AGENTS` research notes; leave `16384` until provider contract proven

*Pros:* Zero risk. *Cons:* Does not deliver 256k.

**Preliminary recommendation (to be confirmed by B1–B3):** **Option 3** — graduated, keep `16384` default, expose up to provider-proven max (target `256k`), raise `600k/8M/180s` guards proportionally, document cost/timeout.

---

## 6. Verification Gates (ALWAYS LAST — paste outputs)

| Gate | Command | Expected |
|------|---------|----------|
| G1 | `npm run typecheck` | `✓ Types generated` |
| G2 | `npm run lint` | `0 problems` |
| G3 | `npm test` | `15/15` (updated `core.test.mjs` passes) |
| G4 | `npm run build` | `6 routes`, `maxDuration` correct |
| G5 | Manual `maxTokens:256000` → should `safeParse true` (was `false`) | `node -e` probe |
| G6 | `POST /api/chat` with `maxTokens:256000` (no key → `503`, with key → stream or `502` if provider caps) | Curated, not raw |
| G7 | `npm run test:e2e` (if provider key available, `maxTokens:256000` short prompt → `finish_reason length` vs `stop`) | `16 passed` still |
| G8 | `curl https://integrate.api.nvidia.com/v1/chat/completions` with `256000` (if key) | `200` or exact `400` cap message |

---

## 7. Done-When & Next Action (requires your confirmation)

**Done when:**
- [ ] Phase A ticks with `rg` outputs — all 10 token limits inventoried
- [ ] Phase B ticks with scraped NVIDIA docs + (if key) live `256k` probe — provider ceiling proven
- [ ] Phase C ticks with `safeParse` + `502` path + size/time math — cascading limits documented
- [ ] Root cause H1–H5 ranked with one confirmed (or new H)
- [ ] One fix option (1–4) chosen and its tradeoff explicitly accepted
- [ ] This plan marked `[x]` per task as evidence accrues

**Next action — pick one:**

- **Option A — "investigate read-only"**: Execute Phases A–C (rg + web_search/scrape + safeParse probes, no DB mutation, no code), deliver ranked root cause + recommended fix (1–4) — no writes.
- **Option B — "investigate + live probe"**: Above plus `curl` live `max_tokens:256000` against NVIDIA (needs `NVIDIA_API_KEY` from `.env` / deployment env) — proves provider ceiling with evidence.
- **Option C — "investigate + implement"**: After confirming H1–H5, implement the chosen fix (validation + types + UI + guards + tests + docs), re-run G1–G8, commit on `main`.

Tell me which option to execute — I will not mutate code or call the provider until you confirm.

---

## Appendix — Quick inventory (pre-validated this session)

| Check | Output |
|-------|--------|
| `rg -n "16384" src/` | `validation.ts:22 max(16384)`, `types.ts:13 default 16384`, `workspace.tsx option 16384`, `core.test.mjs 20000 rejected` |
| `rg -n "maxTokens" src/` | 4 files (validation, types, workspace, route) |
| `rg -n "600_000" src/` | `route.ts:257` |
| `rg -n "maxDuration" src/` | `route.ts:8 maxDuration=180` |
