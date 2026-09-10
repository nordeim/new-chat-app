import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("read-only discovery: welcome, starters, settings and accessibility", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Good things start with a conversation." })).toBeVisible();
  await page.getByRole("button", { name: "Build something" }).click();
  await page.getByRole("button", { name: "Help me plan a new web application" }).click();
  await expect(page.getByRole("textbox", { name: "Message Kimi" })).toHaveValue("Help me plan a new web application");
  await page.getByRole("button", { name: "Chat settings", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
  await page.screenshot({ path: "/tmp/kimi-readonly-desktop.png", fullPage: true });
});

test("read-only mobile navigation supports Escape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.screenshot({ path: "/tmp/kimi-readonly-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Collapse sidebar" })).not.toBeVisible();
});
