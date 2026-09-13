import "dotenv/config";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../src/db";
import { conversations, sessions } from "../src/db/schema";
import { pruneIdleSessions, pruneStaleConversations } from "../src/lib/retention";
const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";
test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
test.afterAll(async () => {
  await pool.end();
});

test("welcome, prompt starters, settings and accessible dialogs", async ({
  page,
}) => {
  await page.goto(base);
  await expect(
    page.getByRole("heading", {
      name: "Good things start with a conversation.",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Build something" }).click();
  await page
    .getByRole("button", { name: "Help me plan a new web application" })
    .click();
  await expect(page.getByRole("textbox", { name: "Message Kimi" })).toHaveValue(
    "Help me plan a new web application",
  );
  await page
    .getByRole("button", { name: "Chat settings", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByLabel("Reasoning effort", { exact: true })
    .selectOption("low");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Deep think" }),
  ).toHaveAttribute("aria-pressed", "false");
  await page
    .getByRole("button", { name: "New chat", exact: false })
    .first()
    .click();
  await expect(page.getByRole("textbox", { name: "Message Kimi" })).toHaveValue(
    "",
  );
  await page.screenshot({ path: "/tmp/kimi-desktop.png", fullPage: true });
});

test("reports missing provider key without discarding the draft", async ({
  page,
}) => {
  await page.goto(base);
  await page
    .getByRole("textbox", { name: "Message Kimi" })
    .fill("Help me plan a thoughtful project");
  await expect(
    page.getByRole("button", { name: "Send message" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Send message" }).click();
  // Target the app's own banner: Next.js injects a global role="alert" route
  // announcer, so unscoped alert locators are forbidden (see AGENTS.md).
  await expect(
    page.locator(".error-banner").filter({ hasText: "Connect NVIDIA" }),
  ).toContainText("Add NVIDIA_API_KEY");
  await expect(page.getByRole("textbox", { name: "Message Kimi" })).toHaveValue(
    "Help me plan a thoughtful project",
  );
  await expect(
    page.getByRole("heading", {
      name: "Good things start with a conversation.",
    }),
  ).toBeVisible();
});

test("image attachment can be added and removed", async ({ page }) => {
  await page.goto(base);
  await page
    .getByLabel("Upload image", { exact: true })
    .setInputFiles({
      name: "one-pixel.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await expect(page.getByAltText("Attachment preview")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message Kimi" })).toHaveValue(
    "What can you tell me about this image?",
  );
  await page.getByRole("button", { name: "Remove attachment" }).click();
  await expect(page.getByAltText("Attachment preview")).toHaveCount(0);
});

test("mobile navigation and composer fit the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page
      .getByRole("button", { name: "Search conversations", exact: false })
      .first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close navigation", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Message Kimi" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/kimi-mobile.png", fullPage: true });
});

test("mobile navigation closes on Escape and restores focus to the opener", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("button", { name: "New chat" }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".sidebar")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeFocused();
});

test("workspace and settings satisfy automated WCAG AA checks", async ({
  page,
}) => {
  await page.goto(base);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page
    .getByRole("button", { name: "Chat settings", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const dialogResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(dialogResults.violations).toEqual([]);
});

test("conversation CRUD enforces session isolation and same-origin writes", async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const ownerIds: string[] = [];
  try {
    for (const context of [first, second]) {
      const response = await context.request.get(`${base}/api/conversations`);
      expect(response.status()).toBe(200);
      const cookie = (await context.cookies()).find(
        (item) => item.name === "kimi_session",
      );
      expect(cookie?.httpOnly).toBe(true);
      expect(cookie?.sameSite).toBe("Strict");
      ownerIds.push(createHash("sha256").update(cookie!.value).digest("hex"));
    }
    const [item] = await db
      .insert(conversations)
      .values({
        owner: ownerIds[0],
        title: "Isolation test",
        messages: [
          {
            id: crypto.randomUUID(),
            role: "user",
            content: "A private test message",
          },
        ],
      })
      .returning();
    const url = `${base}/api/conversations/${item.id}`;
    expect((await second.request.get(url)).status()).toBe(404);
    expect(
      (
        await second.request.patch(url, {
          headers: { Origin: base },
          data: { title: "Unauthorized change" },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await second.request.delete(url, { headers: { Origin: base } })
      ).status(),
    ).toBe(404);
    expect(
      (
        await first.request.patch(url, {
          headers: { Origin: "https://untrusted.example" },
          data: { title: "Cross-site change" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await first.request.patch(url, {
          headers: { Origin: base },
          data: { title: "" },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await first.request.patch(url, {
          headers: { Origin: base },
          data: { title: "Renamed safely" },
        })
      ).status(),
    ).toBe(200);
    const renamed = await first.request.patch(url, {
      headers: { Origin: base },
      data: { title: "Renamed safely again" },
    });
    expect(renamed.status()).toBe(200);
    expect(renamed.headers()["cache-control"]).toBe("no-store");
    const response = await first.request.get(url);
    expect((await response.json()).conversation.title).toBe(
      "Renamed safely again",
    );
    const page = await first.newPage();
    await page.goto(base);
    await page.getByRole("button", { name: "Renamed safely" }).click();
    await expect(
      page.getByText("A private test message", { exact: true }),
    ).toBeVisible();
    expect(
      (await first.request.delete(url, { headers: { Origin: base } })).status(),
    ).toBe(200);
    expect((await first.request.get(url)).status()).toBe(404);
  } finally {
    for (const owner of ownerIds)
      await db.delete(sessions).where(eq(sessions.id, owner));
    await first.close();
    await second.close();
  }
});

// Delete-while-generating guard: the DELETE route takes FOR UPDATE on the
// session row and refuses with 409 while a response is streaming (busyUntil in
// the future). Closes the documented coverage gap for this path — no provider
// key is needed because DELETE never touches the provider.
test("delete is refused with 409 while a response is generating, then succeeds", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const ownerIds: string[] = [];
  try {
    const response = await context.request.get(`${base}/api/conversations`);
    expect(response.status()).toBe(200);
    const cookie = (await context.cookies()).find(
      (item) => item.name === "kimi_session",
    );
    // Register the owner for the finally-cleanup BEFORE dereferencing the
    // cookie, so an early failure still deletes the server-created session
    // row (cascade removes the conversation) instead of leaking it.
    const owner = createHash("sha256")
      .update(cookie?.value ?? "")
      .digest("hex");
    ownerIds.push(owner);
    expect(cookie?.value).toMatch(/^[a-f0-9]{64}$/);
    const [item] = await db
      .insert(conversations)
      .values({
        owner,
        title: "Busy guard test",
        messages: [
          { id: crypto.randomUUID(), role: "user", content: "streaming now" },
        ],
      })
      .returning();
    const url = `${base}/api/conversations/${item.id}`;
    // Simulate an in-flight generation: the lease is claimed for 60 more seconds.
    await db
      .update(sessions)
      .set({ busyUntil: new Date(Date.now() + 60_000) })
      .where(eq(sessions.id, owner));
    const refused = await context.request.delete(url, {
      headers: { Origin: base },
    });
    expect(refused.status()).toBe(409);
    expect((await refused.json()).error).toBe(
      "Wait for the current response to finish before deleting a conversation.",
    );
    // The conversation survived the refused delete.
    expect((await context.request.get(url)).status()).toBe(200);
    // Lease expired: the same delete now succeeds.
    await db
      .update(sessions)
      .set({ busyUntil: new Date(0) })
      .where(eq(sessions.id, owner));
    expect(
      (await context.request.delete(url, { headers: { Origin: base } })).status(),
    ).toBe(200);
    expect((await context.request.get(url)).status()).toBe(404);
  } finally {
    for (const owner of ownerIds)
      await db.delete(sessions).where(eq(sessions.id, owner));
    await context.close();
  }
});

test("chat lease conflicts surface 429 with curated copy, then recover", async ({
  browser,
}) => {
  // Backlog I2: the atomic one-generation lease is the write serializer for
  // /api/chat, but no test reached the 429 branch (it previously needed a
  // live provider key). Fixtures claim the lease directly in the database,
  // so both the busy-window and the 3 s send-spacing refusals are covered
  // without a provider. Recovery is proven by the next non-conflicting send
  // reaching the (curated) missing-key 503 instead of 429.
  const context = await browser.newContext();
  const ownerIds: string[] = [];
  try {
    await context.request.get(`${base}/api/conversations`);
    const cookie = (await context.cookies()).find(
      (item) => item.name === "kimi_session",
    );
    const owner = createHash("sha256")
      .update(cookie?.value ?? "")
      .digest("hex");
    ownerIds.push(owner);
    expect(cookie?.value).toMatch(/^[a-f0-9]{64}$/);
    const send = () =>
      context.request.post(`${base}/api/chat`, {
        headers: { Origin: base },
        data: {
          content: "lease conflict probe",
          settings: {
            temperature: 1,
            maxTokens: 1024,
            reasoningEffort: "low",
          },
        },
      });
    // Busy window: another generation holds the lease for 60 more seconds.
    await db
      .update(sessions)
      .set({ busyUntil: new Date(Date.now() + 60_000) })
      .where(eq(sessions.id, owner));
    const busy = await send();
    expect(busy.status()).toBe(429);
    expect((await busy.json()).error).toBe(
      "A response is already running, or messages were sent too quickly. Wait a moment and try again.",
    );
    // Send spacing: lease free, but the previous request was under 3 s ago.
    await db
      .update(sessions)
      .set({ busyUntil: new Date(0), lastRequest: new Date() })
      .where(eq(sessions.id, owner));
    const spaced = await send();
    expect(spaced.status()).toBe(429);
    expect((await spaced.json()).error).toBe(
      "A response is already running, or messages were sent too quickly. Wait a moment and try again.",
    );
    // Recovered: with the lease free and spacing satisfied, the request
    // proceeds past the lease to the next guard — the curated missing-key
    // 503 (NVIDIA_API_KEY is deliberately unset for the E2E suite).
    await db
      .update(sessions)
      .set({ busyUntil: new Date(0), lastRequest: new Date(0) })
      .where(eq(sessions.id, owner));
    const recovered = await send();
    expect(recovered.status()).toBe(503);
    expect((await recovered.json()).error).toContain("Connect NVIDIA");
  } finally {
    for (const owner of ownerIds)
      await db.delete(sessions).where(eq(sessions.id, owner));
    await context.close();
  }
});

test("cookieless session creation is throttled per network; cookie traffic is not", async ({
  browser,
}) => {
  // Backlog M3 (app-level portion): every cookieless GET /api/conversations
  // mints a session row, so a scripted client can create unbounded rows with
  // no auth. The app-level guard bounds NEW-session minting per network
  // (trusted-ingress x-forwarded-for convention) while requests that already
  // carry a valid session cookie stay unlimited. Ingress-level limits remain
  // the documented public-service defense; this is defense-in-depth.
  const context = await browser.newContext();
  const mintedTokens: string[] = [];
  let sawThrottle = false;
  try {
    // Establish one session, then prove cookie traffic is never throttled.
    await context.request.get(`${base}/api/conversations`);
    for (let i = 0; i < 5; i++) {
      const response = await context.request.get(`${base}/api/conversations`);
      expect(response.status()).toBe(200);
    }
    // Cookieless flood: fire all requests concurrently so the whole burst
    // lands inside the 10 s window on any runner (serial requests could
    // stretch past the window on slow CI and erode the throttled count).
    // Each response's Set-Cookie header carries the minted session token —
    // captured for precise owner-addressed cleanup in the finally below.
    await context.clearCookies();
    const responses = await Promise.all(
      Array.from({ length: 80 }, () =>
        context.request.get(`${base}/api/conversations`),
      ),
    );
    const statuses = responses.map((response) => response.status());
    for (const response of responses)
      mintedTokens.push(
        ...[...response.headers()["set-cookie"]?.matchAll(/kimi_session=([a-f0-9]{64})/g) ?? []].map(
          (match) => match[1],
        ),
      );
    const allowed = statuses.filter((s) => s === 200).length;
    const throttled = statuses.filter((s) => s === 429).length;
    sawThrottle = throttled > 0;
    expect(allowed + throttled).toBe(statuses.length);
    expect(allowed).toBeGreaterThanOrEqual(40);
    expect(throttled).toBeGreaterThanOrEqual(5);
    const throttledBody = await context.request
      .get(`${base}/api/conversations`)
      .then((r) => (r.status() === 429 ? r.json() : undefined));
    if (throttledBody)
      expect(String(throttledBody.error)).toMatch(
        /new sessions|wait a moment|reload/i,
      );
  } finally {
    // Precise owner-addressed cleanup: the flood mints sessions whose tokens
    // were captured from each response's Set-Cookie header, so they are
    // deleted by owner exactly like every other test's fixtures — no global
    // empty-session sweep that couples this test to unrelated rows.
    for (const token of mintedTokens) {
      await db
        .delete(sessions)
        .where(
          eq(sessions.id, createHash("sha256").update(token).digest("hex")),
        );
    }
    // The flood fills the shared per-network window; drain it so later
    // tests (which mint their own sessions) are not refused by this test.
    if (sawThrottle) await new Promise((r) => setTimeout(r, 10_500));
    await context.close();
  }
});

test("API rejects malformed input and cross-site requests", async ({
  request,
}) => {
  await request.get(`${base}/api/conversations`);
  const invalid = await request.post(`${base}/api/chat`, {
    headers: { Origin: base },
    data: { content: "" },
  });
  expect(invalid.status()).toBe(400);
  // Error responses carry the same no-store contract as success paths
  // (pass-9 I-B: intermediaries must never cache curated error copy).
  expect(invalid.headers()["cache-control"]).toContain("no-store");
  expect(
    (
      await request.post(`${base}/api/chat`, {
        headers: { Origin: "https://untrusted.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post(`${base}/api/chat`, {
        headers: { Origin: "null" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect(
    (await request.get(`${base}/api/conversations/not-a-uuid`)).status(),
  ).toBe(400);
  expect((await request.get(`${base}/api/health`)).status()).toBe(200);
});

test("security headers expose a hardened CSP baseline", async ({ request }) => {
  const response = await request.get(`${base}/`);
  expect(response.status()).toBe(200);
  const headers = response.headers();
  const csp = headers["content-security-policy"] ?? "";
  // Existing invariants: framing, base URLs, plugins.
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("object-src 'none'");
  // Hardened baseline: a safe default fallback plus explicit resource directives.
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("script-src 'self' 'unsafe-inline'");
  expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  expect(csp).toContain("img-src 'self' data:");
  expect(csp).toContain("connect-src 'self'");
  expect(csp).toContain("form-action 'self'");
  // Cloudflare Web Analytics: zones with it enabled inject a beacon script
  // from static.cloudflareinsights.com that reports to cloudflareinsights.com
  // (sendBeacon is governed by connect-src). The live deployment runs behind
  // Cloudflare with the beacon verified present; without these origins the
  // policy blocks it and every page load logs a CSP console error.
  expect(csp).toMatch(/script-src[^;]*https:\/\/static\.cloudflareinsights\.com/);
  expect(csp).toMatch(/connect-src[^;]*https:\/\/cloudflareinsights\.com/);
  // Cross-origin isolation hardening.
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["cross-origin-resource-policy"]).toBe("same-origin");
});

test("same-origin writes pass through trusted proxies via x-forwarded-host", async ({
  request,
}) => {
  await request.get(`${base}/api/conversations`);
  const host = new URL(base).host;
  // The true proxied path: Origin does NOT match Host (ingress rewrote it)
  // but matches x-forwarded-host. Must pass the origin gate (400 = validation,
  // not 403 = origin rejected).
  expect(
    (
      await request.post(`${base}/api/chat`, {
        headers: {
          Origin: "https://proxy-check.example",
          "x-forwarded-host": "proxy-check.example",
        },
        data: { content: "" },
      })
    ).status(),
  ).toBe(400);
  // An origin that matches neither Host nor x-forwarded-host stays rejected.
  expect(
    (
      await request.post(`${base}/api/chat`, {
        headers: {
          Origin: "https://evil.example",
          "x-forwarded-host": host,
        },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post(`${base}/api/chat`, {
        headers: {
          Origin: "https://evil.example",
          "x-forwarded-host": "chat.example.com",
        },
        data: {},
      })
    ).status(),
  ).toBe(403);
});

test("conversation search matches titles and message content, isolated by owner", async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const ownerIds: string[] = [];
  try {
    for (const context of [first, second]) {
      await context.request.get(`${base}/api/conversations`);
      ownerIds.push(
        createHash("sha256")
          .update((await context.cookies()).find((c) => c.name === "kimi_session")!.value)
          .digest("hex"),
      );
    }
    const [item] = await db
      .insert(conversations)
      .values({
        owner: ownerIds[0],
        title: "Quarterly planning notes",
        messages: [
          {
            id: crypto.randomUUID(),
            role: "user",
            content: "The xylophone rehearsal moves to Friday.",
          },
        ],
      })
      .returning();
    const list = (context: typeof first, query: string) =>
      context.request.get(`${base}/api/conversations?q=${query}`);
    // Title match.
    expect((await (await list(first, "quarterly")).json()).conversations).toHaveLength(1);
    // Content match that does not appear in the title.
    expect((await (await list(first, "xylophone")).json()).conversations).toHaveLength(1);
    // No match.
    expect(
      (await (await list(first, "zzz-no-such-term")).json()).conversations,
    ).toHaveLength(0);
    // Another session cannot find it even with an exact term.
    expect(
      (await (await list(second, "xylophone")).json()).conversations,
    ).toHaveLength(0);
    await first.request.delete(`${base}/api/conversations/${item.id}`, {
      headers: { Origin: base },
    });
  } finally {
    for (const owner of ownerIds)
      await db.delete(sessions).where(eq(sessions.id, owner));
    await first.close();
    await second.close();
  }
});

test("rapid scripted search hits a per-session rate limit; plain listing stays free", async ({
  browser,
}) => {
  // Pass-9 finding M-1: the ?q= search expands every owned conversation's
  // JSONB messages (image data included), so scripted sessions must be
  // bounded. The limit only applies to ?q= — the plain workspace load
  // (no term) is a cheap indexed read and must never be throttled.
  const context = await browser.newContext();
  await context.request.get(`${base}/api/conversations`);
  const cookie = (await context.cookies()).find((c) => c.name === "kimi_session");
  const owner = cookie
    ? createHash("sha256").update(cookie.value).digest("hex")
    : null;
  try {
    expect(cookie?.value).toBeTruthy();
    const statuses: number[] = [];
    for (let i = 0; i < 14; i++) {
      const response = await context.request.get(
        `${base}/api/conversations?q=${encodeURIComponent(`term-${i}`)}`,
      );
      statuses.push(response.status());
    }
    const allowed = statuses.filter((s) => s === 200).length;
    const throttled = statuses.filter((s) => s === 429).length;
    expect(allowed).toBeGreaterThanOrEqual(10);
    expect(throttled).toBeGreaterThanOrEqual(1);
    expect(allowed + throttled).toBe(statuses.length);
    const throttledBody = await context.request
      .get(`${base}/api/conversations?q=${encodeURIComponent("term-again")}`)
      .then((r) => (r.status() === 429 ? r.json() : undefined));
    if (throttledBody)
      expect(String(throttledBody.error)).toMatch(/too frequently|moment/i);
    // Plain listing is never throttled, even immediately after a 429.
    for (let i = 0; i < 12; i++) {
      const response = await context.request.get(`${base}/api/conversations`);
      expect(response.status()).toBe(200);
    }
  } finally {
    if (owner) await db.delete(sessions).where(eq(sessions.id, owner));
    await context.close();
  }
});

test("server-side search reads the indexed generated column (B1)", async ({
  browser,
}) => {
  // Backlog B1: the ?q= search must be served from a generated search_text
  // column with a pg_trgm GIN index instead of expanding every conversation's
  // JSONB messages (the pass-9 M-1 amplification the rate limit only
  // mitigates). This pins the infrastructure contract itself: the column is
  // maintained by the database (title + message contents, images excluded),
  // the index serves the ILIKE predicate, and the API behavior is unchanged.
  const context = await browser.newContext();
  await context.request.get(`${base}/api/conversations`);
  const cookie = (await context.cookies()).find((c) => c.name === "kimi_session");
  const owner = cookie
    ? createHash("sha256").update(cookie.value).digest("hex")
    : null;
  try {
    expect(cookie?.value).toBeTruthy();
    const marker = `b1-${Date.now().toString(36)}`;
    const [item] = await db
      .insert(conversations)
      .values({
        owner: owner!,
        title: `B1 probe ${marker}`,
        messages: [
          {
            id: crypto.randomUUID(),
            role: "user",
            content: `content marker ${marker}`,
          },
        ],
      })
      .returning();
    // The generated column exists and is database-maintained on insert.
    const generated = await db.execute(
      sql`SELECT search_text FROM conversations WHERE id = ${item.id}`,
    );
    const searchText = String(generated.rows[0]?.search_text ?? "");
    expect(searchText).toContain(`B1 probe ${marker}`);
    expect(searchText).toContain(`content marker ${marker}`);
    // The trigram index exists and serves the ILIKE predicate (the planner
    // only picks it at scale, so force it off seqscan to prove usability).
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL enable_seqscan = off`);
      const plan = await tx.execute(
        sql`EXPLAIN (COSTS OFF) SELECT id FROM conversations WHERE search_text ILIKE ${"%" + marker + "%"}`,
      );
      const planText = plan.rows
        .map((row) => String(Object.values(row)[0]))
        .join("\n");
      expect(planText).toContain("conversations_search_idx");
    });
    // API behavior preserved: content-only match, owner-isolated.
    const found = await context.request.get(
      `${base}/api/conversations?q=${encodeURIComponent(marker)}`,
    );
    expect(found.status()).toBe(200);
    expect((await found.json()).conversations).toHaveLength(1);
    // Pass-10 L-1: a term containing a newline must never span the
    // title/content join boundary (the pre-B1 per-field semantics could
    // not match across fields, and the search dialog is single-line).
    const spanning = await context.request.get(
      `${base}/api/conversations?q=${encodeURIComponent(`${marker}\ncontent`)}`,
    );
    expect(spanning.status()).toBe(200);
    expect((await spanning.json()).conversations).toHaveLength(0);
    await context.request.delete(`${base}/api/conversations/${item.id}`, {
      headers: { Origin: base },
    });
  } finally {
    if (owner) await db.delete(sessions).where(eq(sessions.id, owner));
    await context.close();
  }
});

test("search dialog finds conversations by message content", async ({ page }) => {
  const context = page.context();
  await context.request.get(`${base}/api/conversations`);
  const owner = createHash("sha256")
    .update(
      (await context.cookies()).find((c) => c.name === "kimi_session")!.value,
    )
    .digest("hex");
  const [item] = await db
    .insert(conversations)
    .values({
      owner,
      title: "Quarterly planning notes",
      messages: [
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "The xylophone rehearsal moves to Friday.",
        },
      ],
    })
    .returning();
  try {
    await page.goto(base);
    await page.keyboard.press("ControlOrMeta+k");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Search conversations").fill("xylophone");
    await expect(
      dialog.getByRole("button", { name: /Quarterly planning notes/ }),
    ).toBeVisible();
    await dialog.getByLabel("Search conversations").fill("zzz-no-such-term");
    await expect(dialog.getByText("No conversations found")).toBeVisible();
  } finally {
    await db.delete(sessions).where(eq(sessions.id, owner));
    await page.close();
  }
});

test("retention prunes idle sessions with their conversations and stale conversations", async () => {
  const idleOwner = createHash("sha256").update("idle-" + crypto.randomUUID()).digest("hex");
  const activeOwner = createHash("sha256").update("active-" + crypto.randomUUID()).digest("hex");
  const staleOwner = createHash("sha256").update("stale-" + crypto.randomUUID()).digest("hex");
  const now = Date.now();
  const daysAgo = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000);
  try {
    // Idle session: never used for chat (epoch lastRequest) with a conversation attached.
    await db.insert(sessions).values({ id: idleOwner, lastRequest: daysAgo(60), busyUntil: new Date(0) });
    const [idleConversation] = await db
      .insert(conversations)
      .values({
        owner: idleOwner,
        title: "Idle workspace chat",
        messages: [{ id: crypto.randomUUID(), role: "user", content: "old" }],
        updatedAt: daysAgo(60),
      })
      .returning();
    // Active session with a fresh conversation must survive both prunes.
    await db.insert(sessions).values({ id: activeOwner, lastRequest: daysAgo(0), busyUntil: new Date(0) });
    await db.insert(conversations).values({
      owner: activeOwner,
      title: "Active workspace chat",
      messages: [{ id: crypto.randomUUID(), role: "user", content: "new" }],
    });
    // Live session whose conversation aged out: conversation prune removes it,
    // session prune keeps the session (it is not idle).
    await db.insert(sessions).values({ id: staleOwner, lastRequest: daysAgo(1), busyUntil: new Date(0) });
    await db.insert(conversations).values({
      owner: staleOwner,
      title: "Stale conversation",
      messages: [{ id: crypto.randomUUID(), role: "user", content: "stale" }],
      updatedAt: daysAgo(90),
    });

    await pruneIdleSessions(db, { sessions }, { idleDays: 30 });
    expect(await db.select().from(sessions).where(eq(sessions.id, idleOwner))).toHaveLength(0);
    // Cascade removed the idle session's conversation.
    expect(
      await db.select().from(conversations).where(eq(conversations.id, idleConversation.id)),
    ).toHaveLength(0);
    expect(await db.select().from(sessions).where(eq(sessions.id, activeOwner))).toHaveLength(1);
    expect(await db.select().from(sessions).where(eq(sessions.id, staleOwner))).toHaveLength(1);

    await pruneStaleConversations(db, { conversations }, { olderThanDays: 30 });
    const staleRows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.owner, staleOwner));
    expect(staleRows).toHaveLength(0);
    expect(await db.select().from(sessions).where(eq(sessions.id, staleOwner))).toHaveLength(1);
    const activeRows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.owner, activeOwner));
    expect(activeRows).toHaveLength(1);
  } finally {
    for (const owner of [idleOwner, activeOwner, staleOwner])
      await db.delete(sessions).where(eq(sessions.id, owner));
  }
});
