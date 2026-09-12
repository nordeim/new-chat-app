// Per-key sliding-window rate limiter used to bound the cost of the server
// side search path (`GET /api/conversations?q=`).
//
// The search expands every owned conversation's JSONB messages array —
// including inline image data — so a scripted session can turn a one-time
// seeding campaign into sustained database CPU pressure (pass-9 finding M-1).
// The limiter bounds how often one session may run that expansion. Plain
// listing (no `?q=`) stays unlimited: it is a cheap indexed read used on every
// workspace load.
//
// State is process-local (module-level in the route): effective for the
// documented single-instance deployment, not a cross-instance guarantee — the
// database lease remains the authority for correctness-critical serialization.
// Entry growth is bounded two ways: expired timestamps are pruned on every
// check, and the key map is capped (oldest-expiry keys dropped first) so
// unique-key floods cannot grow memory unboundedly.
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
