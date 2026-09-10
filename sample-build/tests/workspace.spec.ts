import "dotenv/config";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import { conversations, sessions } from "../src/db/schema";

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

test("saved conversation can be searched renamed exported reopened and deleted", async ({ page, context }) => {
  await page.goto("/");
  await expect.poll(async () => (await context.cookies()).some(cookie => cookie.name === "kimi_session")).toBe(true);
  const cookie = (await context.cookies()).find(item => item.name === "kimi_session");
  if (!cookie) throw new Error("Workspace did not create a session");
  const owner = createHash("sha256").update(cookie.value).digest("hex");
  const title = "Quarterly product research";
  const answer = "Start with interviews, then validate the prototype.";
  try {
    await db.insert(conversations).values({ owner, title, messages: [
      { id: crypto.randomUUID(), role: "user", content: "How should we plan the research?" },
      { id: crypto.randomUUID(), role: "assistant", content: answer, reasoning: "Server-only test reasoning" },
    ] });
    await page.reload();
    await page.getByRole("button", { name: "Search conversations", exact: false }).first().click();
    await page.getByRole("textbox", { name: "Search conversations" }).fill("quarterly");
    await page.getByRole("dialog").getByRole("button", { name: title, exact: false }).click();
    await expect(page.getByText(answer, { exact: true })).toBeVisible();
    await expect(page.getByText("Server-only test reasoning")).toHaveCount(0);
    await page.getByRole("button", { name: "Rename conversation" }).click();
    await page.getByLabel("Conversation title", { exact: true }).fill("Research roadmap");
    await page.getByRole("button", { name: "Save title" }).click();
    await expect(page.locator(".breadcrumb-current")).toHaveText("Research roadmap");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^kimi-.*\.md$/);
    const stream = await download.createReadStream();
    if (!stream) throw new Error("Export did not produce a readable file");
    let exported = "";
    for await (const chunk of stream) exported += chunk.toString();
    expect(exported).toContain("# Research roadmap");
    expect(exported).toContain(answer);
    expect(exported).not.toContain("Server-only test reasoning");
    await page.reload();
    await page.getByRole("button", { name: "Research roadmap", exact: true }).click();
    await expect(page.getByText(answer, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Delete conversation", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete conversation", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Good things start with a conversation." })).toBeVisible();
    expect(await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.owner, owner))).toEqual([]);
  } finally {
    await db.delete(sessions).where(eq(sessions.id, owner));
  }
});
