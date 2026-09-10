import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { SSEParser } from "../src/lib/sse.ts";
import {
  chatInputSchema,
  titleSchema,
  providerChunkSchema,
  settingsSchema,
} from "../src/lib/validation.ts";
import {
  formatRelativeTime,
  groupConversationsByPeriod,
} from "../src/lib/history.ts";
import { getNodeText } from "../src/lib/markdown.ts";
import { workspaceLoadError } from "../src/lib/workspace-error.ts";

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

test("rejects out-of-range model settings and unknown keys", () => {
  assert.equal(
    settingsSchema.safeParse({
      temperature: 1,
      maxTokens: 1024,
      reasoningEffort: "low",
    }).success,
    true,
  );
  assert.equal(
    settingsSchema.safeParse({
      temperature: 3,
      maxTokens: 1024,
      reasoningEffort: "low",
    }).success,
    false,
  );
  assert.equal(
    settingsSchema.safeParse({
      temperature: 1,
      maxTokens: 1024,
      reasoningEffort: "low",
      extra: true,
    }).success,
    false,
  );
});

test("groups conversations into today, yesterday, previous 7 days, and older", () => {
  const now = new Date("2026-09-10T15:00:00");
  const item = (id, updatedAt) => ({
    id,
    title: id,
    updatedAt,
  });
  const grouped = groupConversationsByPeriod(
    [
      item("today", "2026-09-10T09:00:00"),
      item("yesterday", "2026-09-09T18:00:00"),
      item("week", "2026-09-05T12:00:00"),
      item("older", "2026-08-01T12:00:00"),
    ],
    now,
  );
  assert.deepEqual(
    grouped.map((group) => [group.label, group.items.map((row) => row.id)]),
    [
      ["Today", ["today"]],
      ["Yesterday", ["yesterday"]],
      ["Previous 7 days", ["week"]],
      ["Older", ["older"]],
    ],
  );
});

test("omits empty history periods and preserves input order within a period", () => {
  const now = new Date("2026-09-10T15:00:00");
  const grouped = groupConversationsByPeriod(
    [
      { id: "a", title: "A", updatedAt: "2026-09-10T10:00:00" },
      { id: "b", title: "B", updatedAt: "2026-09-10T08:00:00" },
    ],
    now,
  );
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].label, "Today");
  assert.deepEqual(
    grouped[0].items.map((row) => row.id),
    ["a", "b"],
  );
});

test("formats relative timestamps against a frozen now", () => {
  const now = Date.parse("2026-09-10T15:00:00Z");
  assert.equal(formatRelativeTime("2026-09-10T14:59:30Z", now), "Just now");
  assert.equal(formatRelativeTime("2026-09-10T14:40:00Z", now), "20m ago");
  assert.equal(formatRelativeTime("2026-09-10T12:00:00Z", now), "3h ago");
  assert.equal(formatRelativeTime("2026-09-08T15:00:00Z", now), "2d ago");
  assert.match(formatRelativeTime("2026-08-01T15:00:00Z", now), /^[A-Z][a-z]{2} \d{1,2}$/);
});

test("extracts text from nested markdown nodes for code copy", () => {
  assert.equal(getNodeText("plain"), "plain");
  assert.equal(getNodeText(["a", "b"]), "ab");
  assert.equal(getNodeText(12), "12");
  assert.equal(getNodeText(null), "");
  assert.equal(
    getNodeText(createElement("code", { className: "language-ts" }, "const x = 1")),
    "const x = 1",
  );
});

test("workspace load copy distinguishes a down database from a generic failure", () => {
  assert.equal(
    workspaceLoadError({ ok: false }),
    "The workspace cannot reach its database. Check that PostgreSQL is running and DATABASE_URL is correct, then retry.",
  );
  assert.equal(
    workspaceLoadError({ ok: true }),
    "Could not load your workspace. Please reload.",
  );
  assert.equal(
    workspaceLoadError(null),
    "Could not load your workspace. Please reload.",
  );
});
