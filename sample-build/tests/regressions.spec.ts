import { test, expect } from "@playwright/test";

const first = { id: "11111111-1111-4111-8111-111111111111", title: "Original conversation", updatedAt: "2026-09-10T10:00:00Z" };
const second = { ...first, id: "22222222-2222-4222-8222-222222222222", title: "Unavailable conversation" };

test.beforeEach(async ({ page }) => {
  await page.route("**/api/conversations", route => route.fulfill({ json: { conversations: [first, second], configured: true } }));
});

test("failed navigation cannot silently send into the previously selected conversation", async ({ page }) => {
  await page.route(`**/api/conversations/${first.id}`, route => route.fulfill({ json: { conversation: { ...first, messages: [{ id: "m1", role: "user", content: "Original message" }] } } }));
  await page.route(`**/api/conversations/${second.id}`, route => route.fulfill({ status: 503, json: { error: "Conversation unavailable. Try again." } }));
  await page.goto("/");
  await page.getByRole("button", { name: first.title, exact: true }).click();
  await expect(page.getByText("Original message", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: second.title, exact: true }).click();
  await expect(page.locator(".error-banner")).toContainText("Conversation unavailable");
  await expect(page.locator(".breadcrumb-current")).toHaveText("New chat");
  await expect(page.getByRole("button", { name: "Rename conversation" })).toHaveCount(0);
});

test("mobile navigation closes on Escape and restores trigger focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Open navigation" });
  await trigger.click();
  await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Collapse sidebar" })).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("mobile drawer keeps keyboard focus inside navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Kimi home" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator(".sidebar")).toContainText("Your workspace");
  expect(await page.locator(".sidebar").evaluate(element => element.contains(document.activeElement))).toBe(true);
});

test("interrupted stream shows recovery without keeping a partial answer", async ({ page }) => {
  const events = [{ type: "meta", conversation: first }, { type: "delta", content: "Partial answer" }];
  await page.route("**/api/chat", route => route.fulfill({ contentType: "text/event-stream", body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") }));
  await page.goto("/");
  await page.getByRole("textbox", { name: "Message Kimi" }).fill("An interrupted question");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".error-banner")).toContainText("connection ended early");
  await expect(page.getByText("Partial answer", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});
