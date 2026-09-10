import { test, expect } from "@playwright/test";

const alpha = { id: "a46d4d45-0449-4d30-a3c4-dbe77c2dd9c6", title: "Alpha planning", updatedAt: "2026-09-10T12:00:00Z" };
const beta = { id: "f3d51bcb-7723-48db-bec3-3f143ae89c58", title: "Beta research", updatedAt: "2026-09-10T11:00:00Z" };

for (const failureMode of ["unavailable", "malformed"] as const) {
test(`failed search (${failureMode}) does not retain another query's results and can retry`, async ({ page }) => {
  let fail = true;
  await page.route("**/api/conversations?*", async (route) => {
    const term = new URL(route.request().url()).searchParams.get("q");
    if (term === "beta" && fail) {
      return failureMode === "unavailable"
        ? route.fulfill({ status: 503, json: { error: "Search unavailable" } })
        : route.fulfill({ json: { conversations: "invalid contract" } });
    }
    await route.fulfill({ json: { conversations: [term === "alpha" ? alpha : beta] } });
  });
  await page.route("**/api/conversations", (route) => route.fulfill({ json: { conversations: [alpha, beta], configured: false } }));
  await page.goto("/");
  await page.getByRole("button", { name: /Search conversations/ }).click();
  const dialog = page.getByRole("dialog");
  const firstSearch = page.waitForResponse((response) => response.url().includes("?q=alpha"));
  await dialog.getByRole("textbox", { name: "Search conversations" }).fill("alpha");
  await expect(dialog.getByRole("button", { name: /Alpha planning/ })).toBeVisible();
  await firstSearch;
  const failed = page.waitForResponse((response) => response.url().includes("?q=beta"));
  await dialog.getByRole("textbox", { name: "Search conversations" }).fill("beta");
  await failed;
  await expect(dialog.getByRole("button", { name: /Alpha planning/ })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /Beta research/ })).toBeVisible();
  await expect(dialog.getByText(/Showing title matches only/)).toBeVisible();
  fail = false;
  const retried = page.waitForResponse((response) => response.url().includes("?q=beta") && response.status() === 200);
  await dialog.getByRole("button", { name: "Retry search" }).click();
  await retried;
  await expect(dialog.getByText(/Showing title matches only/)).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /Beta research/ })).toBeVisible();
});
}

test("failed conversation navigation clears the previous send destination", async ({ page }) => {
  await page.route("**/api/conversations", (route) => route.fulfill({ json: { conversations: [alpha, beta], configured: false } }));
  await page.route(`**/api/conversations/${alpha.id}`, (route) => route.fulfill({ json: { conversation: { ...alpha, messages: [{ id: "original-message", role: "user", content: "Original alpha context" }] } } }));
  await page.route(`**/api/conversations/${beta.id}`, (route) => route.fulfill({ status: 503, json: { error: "This conversation could not be loaded. Try again." } }));
  let destination: unknown = "not sent";
  await page.route("**/api/chat", async (route) => {
    destination = (route.request().postDataJSON() as { conversationId?: string }).conversationId;
    await route.fulfill({ status: 503, json: { error: "Provider unavailable for this test." } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Alpha planning" }).click();
  await expect(page.getByText("Original alpha context")).toBeVisible();
  await page.getByRole("button", { name: "Beta research" }).click();
  await expect(page.locator(".error-banner")).toContainText("could not be loaded");
  await expect(page.locator(".breadcrumb-current")).toHaveText("New chat");
  await page.getByRole("textbox", { name: "Message Kimi" }).fill("A separate idea");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".error-banner")).toContainText("Provider unavailable");
  expect(destination).toBeUndefined();
});
