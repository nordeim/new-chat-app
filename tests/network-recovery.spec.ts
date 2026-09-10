import { test, expect } from "@playwright/test";

test("network failure gives actionable guidance and keeps the unsent draft", async ({ page }) => {
  await page.route("**/api/conversations", (route) => route.fulfill({
    json: { conversations: [], configured: true },
  }));
  await page.route("**/api/chat", (route) => route.abort("connectionreset"));
  await page.goto("/");
  await page.getByRole("textbox", { name: "Message Kimi" }).fill("Keep this idea safe");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".error-banner")).toContainText("Check your network and try again");
  await expect(page.locator(".error-banner")).not.toContainText(/Failed to fetch|network error/i);
  await expect(page.getByRole("textbox", { name: "Message Kimi" })).toHaveValue("Keep this idea safe");
  await expect(page.getByRole("button", { name: "Stop response" })).toHaveCount(0);
});
