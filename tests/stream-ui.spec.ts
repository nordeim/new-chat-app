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
  const banner = page
    .getByRole("alert")
    .filter({ hasText: "Could not load your workspace. Please reload." });
  await expect(banner).toBeVisible();
  const text = await banner.innerText();
  expect(text).not.toMatch(/unexpected|token|json/i);
});
