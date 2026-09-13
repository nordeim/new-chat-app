import { test } from "node:test";
import assert from "node:assert/strict";

// Sliding-window rate limiter, shared by two call sites: the per-session
// `?q=` search limiter (defense-in-depth now that search runs on the indexed
// search_text column — short terms still degrade to sequential scans) and the
// per-network session-mint limiter in server.ts (keys derived through
// client-key.ts). Pure and dependency-free so node:test can exercise it like
// origin.ts / keepalive.ts; time is injectable for deterministic tests.
const { createRateLimiter } = await import("../src/lib/throttle.ts");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("allows a burst up to the limit inside the window", () => {
  const now = 1_000_000;
  let clock = now;
  const limiter = createRateLimiter({
    windowMs: 10_000,
    max: 10,
    clock: () => clock,
  });
  for (let i = 0; i < 10; i++)
    assert.equal(limiter.allow("session-a"), true, `beat ${i} must pass`);
  assert.equal(limiter.allow("session-a"), false, "burst beyond max is denied");
});

test("the window slides: old entries expire and re-allow", () => {
  let clock = 1_000_000;
  const limiter = createRateLimiter({
    windowMs: 10_000,
    max: 3,
    clock: () => clock,
  });
  for (let i = 0; i < 3; i++) limiter.allow("session-a");
  assert.equal(limiter.allow("session-a"), false);
  clock += 10_001;
  assert.equal(limiter.allow("session-a"), true, "expired entries re-allow");
});

test("partial expiry only frees the expired share", () => {
  let clock = 1_000_000;
  const limiter = createRateLimiter({
    windowMs: 10_000,
    max: 3,
    clock: () => clock,
  });
  limiter.allow("session-a"); // t0
  clock += 5_000;
  limiter.allow("session-a"); // t5
  limiter.allow("session-a"); // t5
  assert.equal(limiter.allow("session-a"), false); // 3 in window
  clock += 5_001; // t0 entry is now > window old, t5 entries remain
  assert.equal(limiter.allow("session-a"), true); // 2 in window + this = 3
  assert.equal(limiter.allow("session-a"), false);
});

test("keys are isolated from each other", () => {
  const limiter = createRateLimiter({ windowMs: 10_000, max: 1 });
  assert.equal(limiter.allow("session-a"), true);
  assert.equal(limiter.allow("session-a"), false);
  assert.equal(limiter.allow("session-b"), true, "other keys unaffected");
});

test("the entry cap prunes idle keys oldest-first", () => {
  let clock = 0;
  const limiter = createRateLimiter({
    windowMs: 60_000,
    max: 1,
    maxEntries: 3,
    clock: () => clock,
  });
  limiter.allow("old-1"); // t0
  clock += 10_000;
  limiter.allow("old-2"); // t10
  clock += 10_000;
  limiter.allow("old-3"); // t20
  clock += 10_000;
  limiter.allow("fresh-4"); // t30 → size 4 > cap 3 → oldest-expiry key dropped
  assert.equal(limiter.size(), 3);
  // old-1 was pruned: with a 60 s window its t0 hit would still block it if
  // it were tracked — being allowed proves the entry is gone.
  clock += 1;
  assert.equal(limiter.allow("old-1"), true);
});

test("the entry cap bounds memory against unique-key floods", () => {
  let clock = 0;
  const limiter = createRateLimiter({
    windowMs: 60_000,
    max: 1,
    maxEntries: 5,
    clock: () => clock,
  });
  for (let i = 0; i < 50; i++) limiter.allow(`flood-${i}`);
  assert.ok(limiter.size() <= 5, `map must stay capped, got ${limiter.size()}`);
});

test("invalid options are rejected with RangeError", () => {
  for (const bad of [
    { windowMs: 0, max: 1 },
    { windowMs: -1, max: 1 },
    { windowMs: 10.5, max: 1 },
    { windowMs: 10_000, max: 0 },
    { windowMs: 10_000, max: 2.5 },
    { windowMs: 10_000, max: 1, maxEntries: 0 },
  ]) {
    assert.throws(() => createRateLimiter(bad), RangeError);
  }
});

test("works with the real clock across real time", async () => {
  const limiter = createRateLimiter({ windowMs: 60, max: 2 });
  assert.equal(limiter.allow("real"), true);
  assert.equal(limiter.allow("real"), true);
  assert.equal(limiter.allow("real"), false);
  await sleep(70);
  assert.equal(limiter.allow("real"), true);
});
