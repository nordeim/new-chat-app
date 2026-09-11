import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { SSEParser } from "../src/lib/sse.ts";
import {
  chatInputSchema,
  titleSchema,
  providerChunkSchema,
} from "../src/lib/validation.ts";
import {
  formatRelativeTime,
  groupConversationsByPeriod,
} from "../src/lib/history.ts";
import { getNodeText } from "../src/lib/markdown.ts";
import { workspaceLoadError } from "../src/lib/workspace-error.ts";
import { deriveTitle } from "../src/lib/title.ts";
import {
  streamAbortKind,
  streamAbortLog,
  streamErrorLog,
  abortErrorLog,
} from "../src/lib/stream-abort.ts";

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
test("rejects malformed provider payloads, accepts reasoning deltas", () => {
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

test("treats invalid history timestamps as today instead of crashing", () => {
  const now = new Date("2026-09-10T15:00:00");
  const grouped = groupConversationsByPeriod(
    [{ id: "bad", title: "Bad", updatedAt: "not-a-date" }],
    now,
  );
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].label, "Today");
});

test("formats relative timestamps against a frozen now", () => {
  const now = Date.parse("2026-09-10T15:00:00Z");
  assert.equal(formatRelativeTime("2026-09-10T14:59:30Z", now), "Just now");
  assert.equal(formatRelativeTime("2026-09-10T14:40:00Z", now), "20m ago");
  assert.equal(formatRelativeTime("2026-09-10T12:00:00Z", now), "3h ago");
  assert.equal(formatRelativeTime("2026-09-08T15:00:00Z", now), "2d ago");
  assert.match(
    formatRelativeTime("2026-08-01T15:00:00Z", now),
    /^[A-Z][a-z]{2} \d{1,2}$/,
  );
});

test("extracts text from nested markdown nodes for code copy", () => {
  assert.equal(getNodeText("plain"), "plain");
  assert.equal(getNodeText(["a", "b"]), "ab");
  assert.equal(getNodeText(12), "12");
  assert.equal(getNodeText(null), "");
  assert.equal(
    getNodeText(
      createElement("code", { className: "language-ts" }, "const x = 1"),
    ),
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

test("classifies runtime abort errors as client disconnects", () => {
  // Next.js aborts request.signal with this named error when the browser
  // disconnects mid-stream (Stop, refresh, tab close, navigation).
  const responseAborted = Object.assign(new Error("The response was aborted"), {
    name: "ResponseAborted",
  });
  assert.equal(streamAbortKind(responseAborted), "client-disconnect");
  // The stream-cancel path aborts without a reason (default AbortError) and
  // can win the race against the named error for the same disconnect.
  const stopped = new DOMException("This operation was aborted", "AbortError");
  assert.equal(streamAbortKind(stopped), "client-disconnect");
  assert.equal(streamAbortKind(new Error("boom")), null);
  assert.equal(streamAbortKind("boom"), null);
  assert.equal(streamAbortKind(undefined), null);
});

test("classifies the route timeout separately from client disconnects", () => {
  const timedOut = new DOMException("The operation timed out", "TimeoutError");
  assert.equal(streamAbortKind(timedOut), "timeout");
});

test("recognizes Node's premature client-close signature on request bodies", () => {
  // IncomingMessage 'error' when the client destroys the socket mid-upload:
  // verified live — name="Error", message="aborted", code="ECONNRESET".
  const connReset = Object.assign(new Error("aborted"), { code: "ECONNRESET" });
  assert.equal(streamAbortKind(connReset), "client-disconnect");
  // A provider/database connection reset with different wording is a real
  // failure, not a client abort.
  const pgReset = Object.assign(new Error("Connection terminated unexpectedly"), {
    code: "ECONNRESET",
  });
  assert.equal(streamAbortKind(pgReset), null);
});

test("stream abort log is warn-level structured JSON that leaks no content", () => {
  const { level, line } = streamAbortLog({
    operation: "chat.stream",
    conversationId: "c1",
    abortBy: "client-disconnect",
    partialChars: 123,
  });
  assert.equal(level, "warn");
  assert.deepEqual(JSON.parse(line), {
    operation: "chat.stream",
    conversationId: "c1",
    outcome: "aborted",
    abortBy: "client-disconnect",
    partialChars: 123,
  });
});

test("stream error log keeps the established error-level shape", () => {
  const { level, line } = streamErrorLog({
    operation: "chat.stream",
    conversationId: "c1",
    errorType: "TypeError",
  });
  assert.equal(level, "error");
  assert.deepEqual(JSON.parse(line), {
    operation: "chat.stream",
    conversationId: "c1",
    errorType: "TypeError",
  });
});

test("create-path abort log is warn-level with kind and runtime error name", () => {
  const { level, line } = abortErrorLog({
    operation: "chat.create",
    requestId: "r1",
    abortBy: "client-disconnect",
    errorType: "Error",
  });
  assert.equal(level, "warn");
  assert.deepEqual(JSON.parse(line), {
    operation: "chat.create",
    requestId: "r1",
    outcome: "aborted",
    abortBy: "client-disconnect",
    errorType: "Error",
  });
});

// deriveTitle: the server derives the stored conversation title from the first
// prompt. Newlines and tabs must collapse (sidebar items and aria-labels render
// single lines), and the 70-unit cut must never split a surrogate pair.
test("deriveTitle collapses whitespace runs into single spaces", () => {
  assert.equal(
    deriveTitle("plan:\n  step one\t\tstep two\n\nstep three"),
    "plan: step one step two step three",
  );
});

test("deriveTitle trims leading and trailing whitespace", () => {
  assert.equal(deriveTitle("   hello there \n "), "hello there");
});

test("deriveTitle keeps short single-line prompts unchanged", () => {
  assert.equal(deriveTitle("Explain a tricky piece of code"), "Explain a tricky piece of code");
});

test("deriveTitle caps at 70 characters", () => {
  assert.equal(deriveTitle("a".repeat(90)).length, 70);
  assert.equal(deriveTitle("a".repeat(90)), "a".repeat(70));
});

test("deriveTitle does not split surrogate pairs at the cap", () => {
  // 69 'a' + one emoji (2 UTF-16 units): the cap lands inside the pair.
  const withEmoji = "a".repeat(69) + "😀".repeat(3);
  const title = deriveTitle(withEmoji);
  const points = [...title];
  assert.equal(points.length, 70);
  // The emoji survived intact at the boundary: complete characters only.
  assert.equal(points.at(-1), "😀");
  assert.ok(points.slice(0, 69).every((c) => c === "a"));
});

test("deriveTitle handles CRLF and mixed separators", () => {
  assert.equal(deriveTitle("one\r\ntwo\rthree"), "one two three");
});

// R1/R4/R5: the derived title must satisfy BOTH caps — 70 code points AND
// 100 UTF-16 units — so the rename path (titleSchema .max(100) counts UTF-16
// units) always accepts the stored title verbatim; no trailing space; and the
// empty-input contract is pinned for future callers of the pure helper.
test("deriveTitle stays within 100 UTF-16 units for astral-heavy prompts", () => {
  const astral = "😀".repeat(80); // 80 code points = 160 UTF-16 units
  const title = deriveTitle(astral);
  assert.ok(title.length <= 100, `expected at most 100 UTF-16 units, got ${title.length}`);
  assert.ok([...title].every((c) => c === "😀"));
});

test("deriveTitle never ends with a trailing space after the cap", () => {
  // 69 'a' + a space as the 70th code point.
  const title = deriveTitle("a".repeat(69) + " " + "b".repeat(10));
  assert.ok(!title.endsWith(" "), JSON.stringify(title));
});

test("deriveTitle collapses Unicode whitespace to single spaces", () => {
  assert.equal(deriveTitle("one\u00A0\u00A0two\u3000three"), "one two three");
});

test("deriveTitle returns an empty string for empty or whitespace-only input", () => {
  assert.equal(deriveTitle(""), "");
  assert.equal(deriveTitle(" \n\t "), "");
});
