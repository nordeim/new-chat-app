import "dotenv/config";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
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
  await expect(
    page.getByRole("alert").filter({ hasText: "Connect NVIDIA" }),
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

test("API rejects malformed input and cross-site requests", async ({
  request,
}) => {
  await request.get(`${base}/api/conversations`);
  expect(
    (
      await request.post(`${base}/api/chat`, {
        headers: { Origin: base },
        data: { content: "" },
      })
    ).status(),
  ).toBe(400);
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
