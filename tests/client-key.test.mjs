import { test } from "node:test";
import assert from "node:assert/strict";
import { clientNetworkKey } from "../src/lib/client-key.ts";

// Pass-10 F-1/F-2: the session-mint throttle key must survive spoofed
// x-forwarded-for values. The FIRST XFF value is client-controlled (proxies
// append, they do not overwrite), so it can never be the trust basis. The
// rightmost value is the one appended by the nearest trusted proxy, and
// cf-connecting-ip is set (and overwritten) by the documented Cloudflare
// ingress. Values must be IP-shaped so oversized junk can never be retained
// as a limiter key (F-2's bounded-memory guarantee).

test("uses cf-connecting-ip when present and valid", () => {
  assert.equal(clientNetworkKey("203.0.113.9", null), "203.0.113.9");
  assert.equal(
    clientNetworkKey("203.0.113.9", "198.51.100.7, 203.0.113.9"),
    "203.0.113.9",
  );
});

test("prefers the rightmost x-forwarded-for value over the first", () => {
  // A client-supplied forged first value must not win.
  assert.equal(clientNetworkKey(null, "spoofed-first, 198.51.100.7"), "198.51.100.7");
  assert.equal(clientNetworkKey(null, "10.0.0.1, 10.0.0.2, 10.0.0.3"), "10.0.0.3");
});

test("accepts IPv6 values", () => {
  assert.equal(clientNetworkKey(null, "2001:db8::1"), "2001:db8::1");
  assert.equal(
    clientNetworkKey("2001:db8::ff00:42:8329", "not-ip, 2001:db8::2"),
    "2001:db8::ff00:42:8329",
  );
  // IPv4-mapped and bracketed forms normalize through the validator.
  assert.equal(clientNetworkKey(null, "::ffff:192.0.2.1"), "::ffff:192.0.2.1");
});

test("rejects non-IP shapes instead of trusting them", () => {
  // Hostnames, junk, and oversized strings fall through to the next source.
  assert.equal(clientNetworkKey("definitely-not-an-ip", "10.0.0.9"), "10.0.0.9");
  assert.equal(clientNetworkKey("definitely-not-an-ip", "also junk"), "direct");
  assert.equal(
    clientNetworkKey(
      null,
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, 192.0.2.5",
    ),
    "192.0.2.5",
  );
  assert.equal(clientNetworkKey(null, "x".repeat(200)), "direct");
  // Empty and whitespace-only values never become keys.
  assert.equal(clientNetworkKey("", "  ,  "), "direct");
  assert.equal(clientNetworkKey("  ", null), "direct");
});

test("trims whitespace around accepted values", () => {
  assert.equal(clientNetworkKey("  203.0.113.9  ", null), "203.0.113.9");
  assert.equal(clientNetworkKey(null, " 10.0.0.4 , 10.0.0.5 "), "10.0.0.5");
});

test("falls back to direct when no header carries a usable value", () => {
  assert.equal(clientNetworkKey(null, null), "direct");
  assert.equal(clientNetworkKey(undefined, undefined), "direct");
  assert.equal(clientNetworkKey(null, ""), "direct");
});

test("never returns a value longer than an IPv6 textual maximum", () => {
  const key = clientNetworkKey("x".repeat(500), "y".repeat(500));
  assert.ok(key.length <= 45);
});
