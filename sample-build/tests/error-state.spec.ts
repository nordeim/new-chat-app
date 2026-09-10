import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("workspace failure is accessible and retry restores the composer", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/conversations", route => {
    requests++;
    return requests === 1
      ? route.fulfill({ status: 503, json: { error: "The workspace could not complete this action. Please try again." } })
      : route.fulfill({ json: { conversations: [], configured: true } });
  });
  await page.goto("/");
  await expect(page.locator(".error-banner")).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations).toEqual([]);
  await page.getByRole("button", { name: "Retry connection" }).click();
  await expect(page.locator(".error-banner")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Message Kimi" }).fill("My draft survives a connection recovery");
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
});

test("invalid image inputs are rejected without losing the typed draft", async ({ page }) => {
  await page.route("**/api/conversations", route => route.fulfill({ json: { conversations: [], configured: true } }));
  await page.goto("/");
  const composer = page.getByRole("textbox", { name: "Message Kimi" });
  await composer.fill("Keep this draft");
  await page.getByLabel("Upload image", { exact: true }).setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Not an image") });
  await expect(page.locator(".error-banner")).toContainText("Choose a PNG, JPEG, or WebP");
  await expect(composer).toHaveValue("Keep this draft");
  await expect(page.getByAltText("Attachment preview")).toHaveCount(0);
  await page.getByLabel("Upload image", { exact: true }).setInputFiles({ name: "oversized.png", mimeType: "image/png", buffer: Buffer.alloc(2 * 1024 * 1024 + 1) });
  await expect(page.locator(".error-banner")).toContainText("under 2 MB");
  await expect(composer).toHaveValue("Keep this draft");
});
