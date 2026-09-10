// Live-deployment E2E. Skipped entirely unless LIVE_SITE_URL is set:
//   LIVE_SITE_URL=https://kimi-chat.example.com npx playwright test tests/live-site.spec.ts
// One minimal send plus deletion of that test-owned conversation when configured.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const base = process.env.LIVE_SITE_URL ?? "";
const live = Boolean(base);

test.skip(!live, "LIVE_SITE_URL is not set — live-deployment suite skipped");

test.describe("live site — workspace UI", () => {
  test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });

  test("page loads with title, welcome state, and no console errors", async ({
    page,
  }, testInfo) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    const response = await page.goto(base, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/Kimi/i);
    await expect(
      page.getByRole("heading", { name: /Good things start/i }),
    ).toBeVisible({ timeout: 15_000 });
    const headers = response!.headers();
    testInfo.attach("response-headers", {
      body: JSON.stringify(headers, null, 2),
      contentType: "application/json",
    });
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(
      headers["x-frame-options"] ?? headers["content-security-policy"],
    ).toBeTruthy();
    expect(consoleErrors).toEqual([]);
  });

  test("prompt starters fill the composer", async ({ page }) => {
    await page.goto(base);
    await expect(
      page.getByRole("heading", { name: /Good things start/i }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Build something" }).click();
    await page
      .getByRole("button", { name: "Help me plan a new web application" })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Message Kimi" }),
    ).toHaveValue("Help me plan a new web application");
  });

  test("settings dialog opens with model controls and connection status", async ({
    page,
  }, testInfo) => {
    await page.goto(base);
    await expect(
      page.getByRole("heading", { name: /Good things start/i }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Chat settings", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(/NVIDIA API key configured|Connect your NVIDIA account/),
    ).toBeVisible();
    const configured = await dialog
      .getByText(/NVIDIA API key configured/)
      .isVisible()
      .catch(() => false);
    testInfo.attach("provider-configured", {
      body: JSON.stringify({ configured }),
      contentType: "application/json",
    });
    await expect(
      dialog.getByLabel("Reasoning effort", { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByLabel("Maximum output tokens")).toBeVisible();
  });

  test("search dialog opens via keyboard shortcut", async ({ page }) => {
    await page.goto(base);
    await expect(
      page.getByRole("heading", { name: /Good things start/i }),
    ).toBeVisible();
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByLabel("Search conversations")).toBeVisible();
  });

  test("mobile viewport has no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base);
    await expect(
      page.getByRole("heading", { name: /Good things start/i }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(
      page.getByRole("button", { name: /Search conversations/ }).first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });

  test("workspace passes automated WCAG AA checks", async ({ page }) => {
    await page.goto(base);
    await expect(
      page.getByRole("heading", { name: /Good things start/i }),
    ).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    if (results.violations.length > 0) {
      test.info().attach("axe-violations", {
        body: JSON.stringify(results.violations, null, 2),
        contentType: "application/json",
      });
    }
    const serious = results.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    );
    expect(serious).toEqual([]);
  });
});

test.describe("live site — API contract", () => {
  test("health endpoint reports database connectivity", async ({ request }) => {
    const response = await request.get(`${base}/api/health`);
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
  });

  test("conversations endpoint sets secure session cookie and returns contract shape", async ({
    request,
  }) => {
    const response = await request.get(`${base}/api/conversations`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("conversations");
    expect(body).toHaveProperty("configured");
    expect(typeof body.configured).toBe("boolean");
    expect(Array.isArray(body.conversations)).toBe(true);
    const setCookie = response.headers()["set-cookie"] ?? "";
    expect(setCookie).toContain("kimi_session=");
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=strict");
    expect(setCookie.toLowerCase()).toContain("secure");
  });

  test("cross-origin write to chat API is rejected", async ({ request }) => {
    await request.get(`${base}/api/conversations`);
    const response = await request.post(`${base}/api/chat`, {
      headers: { Origin: "https://untrusted.example" },
      data: { content: "hi", settings: {} },
    });
    expect(response.status()).toBe(403);
  });

  test("invalid conversation id returns 400", async ({ request }) => {
    const response = await request.get(`${base}/api/conversations/not-a-uuid`);
    expect(response.status()).toBe(400);
  });
});

test.describe("live site — session isolation", () => {
  test("two browser sessions hold independent cookies and histories", async ({
    browser,
  }) => {
    const a = await browser.newContext();
    const b = await browser.newContext();
    const [resA, resB] = await Promise.all([
      a.request.get(`${base}/api/conversations`),
      b.request.get(`${base}/api/conversations`),
    ]);
    expect(resA.status()).toBe(200);
    expect(resB.status()).toBe(200);
    const cookieA = (await a.cookies()).find((c) => c.name === "kimi_session");
    const cookieB = (await b.cookies()).find((c) => c.name === "kimi_session");
    expect(cookieA?.value).toBeTruthy();
    expect(cookieB?.value).toBeTruthy();
    expect(cookieA!.value).not.toBe(cookieB!.value);
    await a.close();
    await b.close();
  });
});

// Provider streaming check — only exercises the model when the deployment
// reports a configured key. The streamed answer must appear in an ASSISTANT
// message (the user bubble is excluded, so a merely-echoed prompt cannot
// satisfy the wait); an error banner or missing persistence fails the test.
test.describe("live site — provider streaming", () => {
  test("sending a message streams a persisted assistant answer", async ({
    page,
  }, testInfo) => {
    // Long enough to observe the server's degraded-path banner: a stalled
    // provider surfaces as a closed stream (~125s behind TLS ingress) or the
    // 175s provider timeout, so the race window must exceed both.
    test.setTimeout(240_000);
    await page.goto(base);
    await expect(
      page.getByRole("heading", { name: /Good things start/i }),
    ).toBeVisible();
    const list = await page.request.get(`${base}/api/conversations`);
    const { configured } = (await list.json()) as { configured: boolean };
    testInfo.attach("pre-send-config", {
      body: JSON.stringify({ configured }),
      contentType: "application/json",
    });
    test.skip(!configured, "Provider key not configured on this deployment");
    // Random nonce: neither the prompt text nor a stale page can satisfy it.
    const nonce = `live-check-${Date.now().toString(36)}`;
    // Minimize provider spend: light effort, small token cap.
    await page
      .getByRole("button", { name: "Chat settings", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog
      .getByLabel("Reasoning effort", { exact: true })
      .selectOption("low");
    await dialog.getByLabel("Maximum output tokens").selectOption("1024");
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Message Kimi" })
      .fill(`Reply with exactly: ${nonce}`);
    await page.getByRole("button", { name: "Send message" }).click();

    const answer = page
      .locator(".message.assistant")
      .filter({ hasText: nonce });
    type Outcome =
      | { kind: "streamed" }
      | { kind: "error-banner"; text: string }
      | { kind: "timeout" };
    // Scope the race to the app's own error banner: Next.js injects a global
    // route announcer with role="alert" (always present, empty), so
    // getByRole("alert") would win the race instantly with empty text.
    const outcome: Outcome = await Promise.race([
      answer
        .first()
        .waitFor({ timeout: 200_000 })
        .then(
          (): Outcome => ({ kind: "streamed" }),
        ),
      page
        .locator(".error-banner")
        .waitFor({ timeout: 200_000 })
        .then(
          async (): Promise<Outcome> => ({
            kind: "error-banner",
            text: await page.locator(".error-banner").innerText(),
          }),
        ),
    ]).catch((): Outcome => ({ kind: "timeout" }));
    testInfo.attach("stream-outcome", {
      body: JSON.stringify({ outcome }),
      contentType: "application/json",
    });
    // With the provider configured, a surfaced error is a product failure,
    // not an acceptable contract outcome — fail loudly with the banner text.
    if (outcome.kind !== "streamed")
      throw new Error(
        outcome.kind === "error-banner"
          ? `Provider send surfaced an error banner: ${outcome.text}`
          : "No streamed answer or error banner within 200 s.",
      );
    await expect(
      page.getByRole("button", { name: "Copy response" }),
    ).toBeVisible({ timeout: 15_000 });
    // The answer must be persisted to the workspace history.
    const persisted = await page.request.get(`${base}/api/conversations`);
    const history = (await persisted.json()) as {
      conversations: { id: string; title: string }[];
    };
    const saved = history.conversations.find((item) => item.title.includes(nonce));
    expect(saved).toBeDefined();
    const detail = await page.request.get(`${base}/api/conversations/${saved!.id}`);
    expect(detail.status()).toBe(200);
    const data = (await detail.json()) as {
      conversation: { messages: { role: string; content: string; reasoning?: string }[] };
    };
    expect(data.conversation.messages.some((message) => message.role === "assistant" && message.content.includes(nonce))).toBe(true);
    expect(data.conversation.messages.every((message) => message.reasoning === undefined)).toBe(true);
    // Remove only this test's conversation; never touch pre-existing histories.
    const cleanup = await page.request.delete(`${base}/api/conversations/${saved!.id}`, { headers: { Origin: base } });
    expect(cleanup.status()).toBe(200);
  });
});
