import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";

function sse(events: object[]): string {
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
}

test("renders a completed streamed answer using a transport fixture", async ({
  page,
}) => {
  const conversationId = crypto.randomUUID();
  const assistantId = crypto.randomUUID();
  const content =
    "## A thoughtful starting point\n\nStart with one small, testable idea.";
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: sse([
        {
          type: "meta",
          conversation: {
            id: conversationId,
            title: "A project plan",
            updatedAt: new Date().toISOString(),
          },
        },
        { type: "thinking" },
        { type: "delta", content: "## A thoughtful starting point\n\n" },
        { type: "delta", content: "Start with one small, testable idea." },
        {
          type: "done",
          message: { id: assistantId, role: "assistant", content },
        },
      ]),
    }),
  );
  await page.goto(base);
  await page
    .getByRole("textbox", { name: "Message Kimi" })
    .fill("Make a project plan");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByRole("heading", { name: "A thoughtful starting point" }),
  ).toBeVisible();
  await expect(
    page.getByText("Start with one small, testable idea.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy response" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop response" })).toHaveCount(
    0,
  );
});

test("interleaved SSE comment frames do not disturb the stream", async ({
  page,
}) => {
  // The chat route emits ": keep-alive" comment frames while the provider is
  // silent (proxy idle-timeout defense). This pins the browser-side contract:
  // comment frames must be ignored by the shared SSEParser and must not break
  // frame parsing, the rendered answer, or the busy-state teardown.
  const conversationId = crypto.randomUUID();
  const assistantId = crypto.randomUUID();
  const content = "Keep-alive frames are invisible to the message stream.";
  await page.route("**/api/conversations", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ conversations: [], configured: true }),
    }),
  );
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      // Data frames are composed with the shared sse() helper; only the
      // comment frames (which the helper cannot express) are interleaved
      // by hand, covering LF and CRLF separators.
      body:
        sse([
          {
            type: "meta",
            conversation: {
              id: conversationId,
              title: "Keep-alive check",
              updatedAt: new Date().toISOString(),
            },
          },
        ]) +
        ": keep-alive\n\n" +
        sse([{ type: "delta", content: "Keep-alive frames are " }]) +
        ": keep-alive\r\n\r\n" +
        sse([{ type: "delta", content: "invisible to the message stream." }]) +
        ": keep-alive\n\n" +
        sse([
          {
            type: "done",
            message: { id: assistantId, role: "assistant", content },
          },
        ]),
    }),
  );
  await page.goto(base);
  await page
    .getByRole("textbox", { name: "Message Kimi" })
    .fill("Check keep-alive tolerance");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByText("Keep-alive frames are invisible to the message stream.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy response" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop response" })).toHaveCount(
    0,
  );
  await expect(page.locator(".error-banner")).toHaveCount(0);
});

test("renders streamed GitHub-Flavored Markdown tables", async ({ page }) => {
  const conversationId = crypto.randomUUID();
  const assistantId = crypto.randomUUID();
  const content = [
    "Here is the rollout plan:",
    "",
    "| Phase | Status |",
    "| ----- | ------ |",
    "| Ship  | Ready  |",
  ].join("\n");
  await page.route("**/api/conversations", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ conversations: [], configured: true }),
    }),
  );
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: sse([
        {
          type: "meta",
          conversation: {
            id: conversationId,
            title: "Rollout plan",
            updatedAt: new Date().toISOString(),
          },
        },
        { type: "delta", content },
        {
          type: "done",
          message: { id: assistantId, role: "assistant", content },
        },
      ]),
    }),
  );
  await page.goto(base);
  await page
    .getByRole("textbox", { name: "Message Kimi" })
    .fill("Draft the rollout plan");
  await page.getByRole("button", { name: "Send message" }).click();
  const table = page.getByRole("table");
  await expect(table).toBeVisible();
  await expect(table.getByRole("cell", { name: "Ready" })).toBeVisible();
});

test("error state shows the server message and passes WCAG AA contrast", async ({
  page,
}) => {
  await page.route("**/api/conversations", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: "The workspace could not complete this action. Please try again.",
      }),
    }),
  );
  await page.goto(base);
  const banner = page.locator(".error-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Could not load your workspace");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  if (results.violations.length > 0) {
    test.info().attach("axe-error-state", {
      body: JSON.stringify(results.violations, null, 2),
      contentType: "application/json",
    });
  }
  const serious = results.violations.filter((v) =>
    ["critical", "serious"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});

test("non-JSON API failure renders friendly copy, not a parse error", async ({
  page,
}) => {
  await page.route("**/api/conversations", (route) =>
    route.fulfill({
      status: 502,
      contentType: "text/html",
      body: "<html><body>Bad Gateway</body></html>",
    }),
  );
  await page.goto(base);
  // Target the app's own banner: Next.js injects a global role="alert" route
  // announcer, so unscoped alert locators are forbidden (see AGENTS.md).
  const banner = page
    .locator(".error-banner")
    .filter({ hasText: "Could not load your workspace. Please reload." });
  await expect(banner).toBeVisible();
  const text = await banner.innerText();
  expect(text).not.toMatch(/unexpected|token|json/i);
});

test("skip link targets the composer", async ({ page }) => {
  await page.route("**/api/conversations", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ conversations: [], configured: true }),
    }),
  );
  await page.goto(base);
  const skip = page.getByRole("link", { name: "Skip to message composer" });
  await expect(skip).toHaveAttribute("href", "#message");
  await expect(page.locator("#message")).toHaveCount(1);
});

test("composer shows a character count as the draft grows", async ({ page }) => {
  await page.route("**/api/conversations", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ conversations: [], configured: true }),
    }),
  );
  await page.goto(base);
  await page.getByRole("textbox", { name: "Message Kimi" }).fill("Hello");
  await expect(page.getByText("5 / 16,000")).toBeVisible();
});

test("database outage shows specific recovery copy", async ({ page }) => {
  await page.route("**/api/conversations", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "down" }),
    }),
  );
  await page.route("**/api/health", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ ok: false }),
    }),
  );
  await page.goto(base);
  // Scoped to the app banner: Next.js's global route announcer also has
  // role="alert" and would otherwise win the locator.
  await expect(page.locator(".error-banner")).toContainText(
    "cannot reach its database",
  );
});

test("fenced code in a streamed answer exposes a copy control", async ({
  page,
}) => {
  const conversationId = crypto.randomUUID();
  const assistantId = crypto.randomUUID();
  const content = "```ts\nconst ready = true;\n```";
  await page.route("**/api/conversations", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ conversations: [], configured: true }),
    }),
  );
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: sse([
        {
          type: "meta",
          conversation: {
            id: conversationId,
            title: "Code sample",
            updatedAt: new Date().toISOString(),
          },
        },
        { type: "delta", content },
        {
          type: "done",
          message: { id: assistantId, role: "assistant", content },
        },
      ]),
    }),
  );
  await page.goto(base);
  await page.getByRole("textbox", { name: "Message Kimi" }).fill("Show code");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("button", { name: "Copy code" })).toBeVisible();
});

test("attached images open in a lightbox", async ({ page }) => {
  const conversationId = crypto.randomUUID();
  const assistantId = crypto.randomUUID();
  await page.route("**/api/conversations", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ conversations: [], configured: true }),
    }),
  );
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: sse([
        {
          type: "meta",
          conversation: {
            id: conversationId,
            title: "Image look",
            updatedAt: new Date().toISOString(),
          },
        },
        { type: "delta", content: "A single green pixel." },
        {
          type: "done",
          message: {
            id: assistantId,
            role: "assistant",
            content: "A single green pixel.",
          },
        },
      ]),
    }),
  );
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
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByAltText("Image attached to your message"),
  ).toBeVisible();
  await page.getByAltText("Image attached to your message").click();
  await expect(
    page.getByRole("dialog", { name: /Image attached/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close image preview" }).click();
  await expect(
    page.getByRole("dialog", { name: /Image attached/ }),
  ).toHaveCount(0);
});

test("malformed stream events render curated copy, not raw parse errors", async ({
  page,
}) => {
  await page.route("**/api/conversations", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ conversations: [], configured: true }),
    }),
  );
  // A degraded proxy/server can emit frames that are complete but not JSON.
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: "data: {broken\n\n",
    }),
  );
  await page.goto(base);
  await page
    .getByRole("textbox", { name: "Message Kimi" })
    .fill("Trigger a malformed frame");
  await page.getByRole("button", { name: "Send message" }).click();
  const banner = page.locator(".error-banner");
  await expect(banner).toContainText(
    "The response stream was interrupted. Please try again.",
  );
  const text = await banner.innerText();
  expect(text).not.toMatch(/unexpected token|JSON|issues|\{/i);
});

test("stop button aborts the stream and restores the draft", async ({ page }) => {
  await page.route("**/api/conversations", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ conversations: [], configured: true }),
    }),
  );
  await page.route("**/api/chat", async (route) => {
    // Hold the request open without ever answering: the send is in-flight
    // until the user presses stop, which aborts the fetch client-side.
    await new Promise(() => {});
  });
  await page.goto(base);
  await page
    .getByRole("textbox", { name: "Message Kimi" })
    .fill("Count to one hundred");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByRole("button", { name: "Stop response" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop response" }).click();
  await expect(page.locator(".error-banner")).toContainText(
    "Response stopped. You can try again when you’re ready.",
  );
  await expect(
    page.getByRole("textbox", { name: "Message Kimi" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("textbox", { name: "Message Kimi" }),
  ).toHaveValue("Count to one hundred");
  await expect(page.locator(".message.assistant")).toHaveCount(0);
});

test("oversized images are rejected client-side with actionable copy", async ({
  page,
}) => {
  await page.route("**/api/conversations", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ conversations: [], configured: true }),
    }),
  );
  await page.goto(base);
  await page.getByLabel("Upload image", { exact: true }).setInputFiles({
    name: "too-big.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 137),
  });
  await expect(page.locator(".error-banner")).toContainText(
    "Choose a PNG, JPEG, or WebP image up to 2 MB.",
  );
});
