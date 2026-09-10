import test from "node:test";
import assert from "node:assert/strict";
import { SSEParser } from "../src/lib/sse.ts";

test("SSE accepts CR-only delimiters and fragmented CRLF", () => {
  const parser = new SSEParser();
  assert.deepEqual(parser.push("data: first\r\rdata: second\r"), ["first"]);
  assert.deepEqual(parser.push("\n\r\n"), ["second"]);
});

test("SSE limits individual events, not coalesced network chunks", () => {
  const value = "a".repeat(600_000);
  assert.deepEqual(new SSEParser().push(`data: ${value}\n\ndata: ${value}\n\n`), [value, value]);
});

test("SSE bounds multiline events and resets the budget after dispatch", () => {
  const parser = new SSEParser();
  const value = "a".repeat(500_000);
  parser.push(`data: ${value}\n`);
  assert.throws(() => parser.push(`data: ${value}\n`), /size limit/);
  const fresh = new SSEParser();
  assert.deepEqual(fresh.push("data: one\n\ndata: two\n\n"), ["one", "two"]);
  assert.deepEqual(fresh.finish(), []);
});
