import { defineConfig } from "@playwright/test";

/**
 * Electron E2E config for Chat Durable Runtime (v8.1.1).
 * Set ELECTRON_APP_PATH to a packaged/binary main entry, or rely on out/main/index.js after build.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  outputDir: "test-results/e2e-electron",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "electron-e2e",
      testMatch: "**/*.spec.ts",
    },
  ],
});
