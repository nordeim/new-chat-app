import { defineConfig, devices } from "@playwright/test";

// The DB-backed suites in workspace.spec.ts require the production preview
// (npm run build && npm start) and a disposable DATABASE_URL. The stream-UI
// suite is hermetic: it mocks both API endpoints and runs anywhere.
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["line"]],
  use: {
    baseURL: process.env.TEST_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.TEST_BASE_URL
    ? undefined
    : {
        command: "npm start",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
