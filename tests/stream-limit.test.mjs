import test from "node:test";
import assert from "node:assert/strict";
import { SSEParser } from "../src/lib/sse.ts";

test("browser parser accepts the largest escaped final answer allowed by the server", () => {
  const content = "\u0001".repeat(1_200_000) + "\n\n*Response reached the output limit. Ask me to continue.*";
  const event = JSON.stringify({ type: "done", message: { id: "boundary", role: "assistant", content } });
  const parser = new SSEParser(8_000_000);
  const events = [];
  const frame = `data: ${event}\n\n`;
  for (let start = 0; start < frame.length; start += 16_384) events.push(...parser.push(frame.slice(start, start + 16_384)));
  assert.equal(events.length, 1);
  assert.equal(JSON.parse(events[0]).message.content, content);
});

test("provider parser retains its smaller default bound", () => {
  assert.throws(() => new SSEParser().push("data: " + "a".repeat(1_000_001)), /size limit/);
});

test("custom parser limit is still enforced", () => {
  assert.throws(() => new SSEParser(100).push("data: " + "a".repeat(101)), /size limit/);
});
