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
    { ...input, settings: { ...input.settings, maxTokens: 300000 } },
  ]) {
    assert.equal(chatInputSchema.safeParse(value).success, false);
  }
});
test("accepts maxTokens up to 256000 (graduated)", () => {
  assert.equal(
    chatInputSchema.safeParse({
      ...input,
      settings: { ...input.settings, maxTokens: 256000 },
    }).success,
    true,
  );
  assert.equal(
    chatInputSchema.safeParse({
      ...input,
      settings: { ...input.settings, maxTokens: 65536 },
    }).success,
    true,
  );
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

test("parses lone-CR separated events and CRLF split across chunks", () => {
  const parser = new SSEParser();
  // Lone CR line separators (SSE allows CR, LF, or CRLF).
  assert.deepEqual(parser.push("data: one\rdata: two\r\r"), ["one\ntwo"]);
  // A CRLF pair split across network chunks must not emit a blank line.
  assert.deepEqual(parser.push("data: A\r"), []);
  assert.deepEqual(parser.push("\ndata: B\r\n\r\n"), ["A\nB"]);
});

test("ignores comment lines and strips exactly one space after data:", () => {
  const parser = new SSEParser();
  assert.deepEqual(parser.push(": ping\n\n"), []);
  assert.deepEqual(parser.push("data:no-space\n\n"), ["no-space"]);
  assert.deepEqual(parser.push("data:  two-spaces\n\n"), [" two-spaces"]);
});

test("rejects oversized lines and oversized accumulated events incrementally", () => {
  assert.throws(
    () => new SSEParser().push("x".repeat(1_000_001)),
    /size limit/,
  );
  const parser = new SSEParser();
  parser.push("data: " + "y".repeat(600_000) + "\n");
  assert.throws(
    () => parser.push("data: " + "y".repeat(500_000) + "\n\n"),
    /size limit/,
  );
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
