import test from "node:test";
import assert from "node:assert/strict";
import { isSameOriginRequest } from "../src/lib/origin.ts";

const SAME = "same-origin write accepted";
const CROSS = "cross-site or unparseable origin rejected";

test("accepts direct same-origin writes (Origin matches Host)", () => {
  assert.equal(
    isSameOriginRequest(
      "https://chat.example.com",
      "chat.example.com",
      null,
      "same-origin",
    ),
    true,
    SAME,
  );
});

test("accepts proxied same-origin writes (Origin matches x-forwarded-host)", () => {
  // The ingress rewrites Host to an internal value; the public hostname
  // arrives in x-forwarded-host (Cloudflare/nginx convention).
  assert.equal(
    isSameOriginRequest(
      "https://chat.example.com",
      "internal-upstream:3000",
      "chat.example.com",
      "same-origin",
    ),
    true,
    SAME,
  );
});

test("uses the first x-forwarded-host value when proxies chain", () => {
  assert.equal(
    isSameOriginRequest(
      "https://chat.example.com",
      "internal:3000",
      "chat.example.com, edge.example.net",
      "same-origin",
    ),
    true,
    SAME,
  );
});

test("accepts non-https origins only over http/https schemes", () => {
  assert.equal(
    isSameOriginRequest("http://localhost:3000", "localhost:3000", null, null),
    true,
    SAME,
  );
  assert.equal(
    isSameOriginRequest(
      "ftp://chat.example.com",
      "chat.example.com",
      null,
      "same-origin",
    ),
    false,
    CROSS,
  );
  assert.equal(
    isSameOriginRequest(
      "javascript:alert(1)",
      "chat.example.com",
      null,
      "same-origin",
    ),
    false,
    CROSS,
  );
});

test("rejects cross-site origins even when headers are missing", () => {
  assert.equal(
    isSameOriginRequest("https://evil.example", "chat.example.com", null, null),
    false,
    CROSS,
  );
  assert.equal(
    isSameOriginRequest(
      "https://evil.example",
      "chat.example.com",
      "chat.example.com",
      "cross-site",
    ),
    false,
    CROSS,
  );
});

test("rejects missing, malformed, and null-origin requests", () => {
  assert.equal(
    isSameOriginRequest(null, "chat.example.com", null, "same-origin"),
    false,
    CROSS,
  );
  assert.equal(
    isSameOriginRequest("", "chat.example.com", null, null),
    false,
    CROSS,
  );
  assert.equal(
    isSameOriginRequest(
      "not-a-url",
      "chat.example.com",
      "chat.example.com",
      null,
    ),
    false,
    CROSS,
  );
  assert.equal(
    isSameOriginRequest(
      "https://chat.example.com",
      null,
      null,
      "same-origin",
    ),
    false,
    CROSS,
  );
});

test("rejects an origin that matches neither Host nor x-forwarded-host", () => {
  assert.equal(
    isSameOriginRequest(
      "https://evil.example",
      "internal:3000",
      "chat.example.com",
      "same-origin",
    ),
    false,
    CROSS,
  );
});
