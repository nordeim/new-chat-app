import test from "node:test";
import assert from "node:assert/strict";
import { SSEParser } from "../src/lib/sse.ts";
import {
  chatInputSchema,
  titleSchema,
  providerChunkSchema,
} from "../src/lib/validation.ts";

const input = {
  content: "Hello",
  settings: { temperature: 1, maxTokens: 16384, reasoningEffort: "max" },
};
test("accepts a valid chat and trims whitespace", () => {
  assert.equal(
    chatInputSchema.parse({ ...input, content: " Hello " }).content,
    "Hello",
  );
});
test("rejects empty, oversized, unknown, and malformed input", () => {
  for (const value of [
    { ...input, content: " " },
    { ...input, content: "a".repeat(16001) },
    { ...input, conversationId: "../x" },
    { ...input, role: "system" },
    { ...input, image: "https://localhost/private" },
    { ...input, settings: { ...input.settings, maxTokens: 20000 } },
  ]) {
    assert.equal(chatInputSchema.safeParse(value).success, false);
  }
});
test("validates title boundaries", () => {
  assert.equal(titleSchema.safeParse({ title: "a".repeat(100) }).success, true);
  assert.equal(titleSchema.safeParse({ title: "" }).success, false);
  assert.equal(
    titleSchema.safeParse({ title: "a".repeat(101) }).success,
    false,
  );
});
test("parses fragmented CRLF and multiline SSE events", () => {
  const parser = new SSEParser();
  assert.deepEqual(parser.push(': keepalive\r\ndata: {"hel'), []);
  assert.deepEqual(parser.push('lo":1}\r\n\r\ndata: first\ndata: second\n\n'), [
    '{"hello":1}',
    "first\nsecond",
  ]);
  assert.deepEqual(parser.push("data: [DONE]"), []);
  assert.deepEqual(parser.finish(), ["[DONE]"]);
});
test("rejects oversized stream frames and malformed provider payloads", () => {
  assert.throws(
    () => new SSEParser().push("x".repeat(1_000_001)),
    /size limit/,
  );
  assert.equal(
    providerChunkSchema.safeParse({ choices: [{ delta: { content: 42 } }] })
      .success,
    false,
  );
  assert.equal(
    providerChunkSchema.safeParse({
      choices: [{ delta: { reasoning_content: "text" } }],
    }).success,
    true,
  );
});
