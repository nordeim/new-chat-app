// Per-key sliding-window rate limiter. Two call sites (pass 10):
//
// 1. `GET /api/conversations?q=` — bounds how often one session may search.
//     Search is now served by the generated `search_text` column (backlog B1),
//     but terms under three characters cannot use the trigram index, so the
//     limiter stays as defense-in-depth against sequential-scan floods.
//     Plain listing (no `?q=`) is a cheap indexed read and stays unlimited.
// 2. Session minting in `src/lib/server.ts` — bounds how many NEW session
//     rows a network can create per window (backlog M3's app-level portion);
//     requests that already carry a valid cookie never touch it.
//
// State is process-local (module-level in each caller): effective for the
// documented single-instance deployment, not a cross-instance guarantee — the
// database lease remains the authority for correctness-critical serialization.
// Entry growth is bounded two ways: expired timestamps are pruned on every
// check, and the key map is capped (oldest-expiry keys dropped first) so
// unique-key floods cannot grow the entry count unboundedly. Keys are
// caller-supplied — the session-mint caller derives them through
// `src/lib/client-key.ts`, which validates IP shapes so key strings stay
// short and stable.
//
// Pure and dependency-free with an injectable clock, following the origin.ts /
// keepalive.ts convention so the node:test suite can exercise it deterministically.
export interface RateLimiterOptions {
  /** Sliding window length in milliseconds (1–600,000). */
  windowMs: number;
  /** Maximum allowed hits per key inside the window (≥ 1). */
  max: number;
  /** Maximum tracked keys before pruning (≥ 1, default 10,000). */
  maxEntries?: number;
  /** Injectable clock for tests; defaults to Date.now. */
  clock?: () => number;
}

export interface RateLimiter {
  /** Records a hit for the key; true when the hit is allowed. */
  allow(key: string): boolean;
  /** Current tracked-key count (observable for tests/ops). */
  size(): number;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { windowMs, max } = options;
  const maxEntries = options.maxEntries ?? 10_000;
  const clock = options.clock ?? Date.now;
  if (
    !Number.isSafeInteger(windowMs) ||
    windowMs < 1 ||
    windowMs > 600_000 ||
    !Number.isSafeInteger(max) ||
    max < 1 ||
    !Number.isSafeInteger(maxEntries) ||
    maxEntries < 1
  )
    throw new RangeError("Invalid rate limiter configuration.");
  const hits = new Map<string, number[]>();
  return {
    allow(key: string) {
      const now = clock();
      const windowStart = now - windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > windowStart);
      const allowed = recent.length < max;
      if (allowed) recent.push(now);
      if (recent.length) hits.set(key, recent);
      else hits.delete(key);
      if (hits.size > maxEntries) {
        // Cap the map: drop keys whose newest hit is the most stale first.
        const stale = [...hits.entries()].sort(
          (a, b) => (a[1].at(-1) ?? 0) - (b[1].at(-1) ?? 0),
        );
        for (const [staleKey] of stale.slice(0, hits.size - maxEntries))
          hits.delete(staleKey);
      }
      return allowed;
    },
    size() {
      return hits.size;
    },
  };
}
