import { test } from "node:test";
import assert from "node:assert/strict";

// The chat route emits SSE comment frames (": keep-alive") on a fixed interval
// while the provider has not yet produced its first byte — proxies (Cloudflare,
// nginx) close connections that sit idle ~100 s, which would otherwise kill the
// browser's stream before the route's provider timeout can deliver its curated
// error event. Pure, dependency-free module so node:test can exercise it like
// origin.ts / title.ts.
const { startKeepAlive } = await import("../src/lib/keepalive.ts");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("keep-alive fires repeatedly while running", async () => {
  let beats = 0;
  const stop = startKeepAlive(() => beats++, 5);
  await sleep(40);
  stop();
  assert.ok(beats >= 3, `expected several beats, got ${beats}`);
});

test("stop halts the keep-alive permanently", async () => {
  let beats = 0;
  const stop = startKeepAlive(() => beats++, 5);
  await sleep(20);
  stop();
  const after = beats;
  await sleep(30);
  assert.equal(beats, after, "no beats may fire after stop");
});

test("stop is idempotent", async () => {
  let beats = 0;
  const stop = startKeepAlive(() => beats++, 5);
  stop();
  stop();
  await sleep(15);
  assert.equal(beats, 0);
});

test("invalid intervals are rejected with RangeError", () => {
  for (const bad of [0, -1, 5.5, Number.MAX_SAFE_INTEGER * 2]) {
    assert.throws(() => startKeepAlive(() => {}, bad), RangeError);
  }
});

test("SSE comment frames are ignored by the shared parser", async () => {
  const { SSEParser } = await import("../src/lib/sse.ts");
  const parser = new SSEParser();
  const events = [
    ...parser.push('data: {"type":"meta"}\n\n'),
    ...parser.push(": keep-alive\n\n"),
    ...parser.push(": keep-alive\r\n\r\n"),
    ...parser.push('data: {"type":"done"}\n\n'),
  ];
  assert.deepEqual(events, ['{"type":"meta"}', '{"type":"done"}']);
});

test("comment frames do not corrupt a data frame split across chunks", async () => {
  const { SSEParser } = await import("../src/lib/sse.ts");
  const parser = new SSEParser();
  const events = [
    ...parser.push('data: {"type":"del'),
    ...parser.push('ta"}\n: keep-alive\n\n'),
  ];
  assert.deepEqual(events, ['{"type":"delta"}']);
});
