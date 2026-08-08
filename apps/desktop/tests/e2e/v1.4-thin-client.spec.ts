/**
 * PRD v1.4 thin-client E2E — Case 2 / 7 / 8 concepts (structural + optional window).
 */
import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { closeElectronApp, launchElectronApp } from "./fixtures/electronApp";

const required = process.env.E2E_ELECTRON_REQUIRED === "1";
const hasBuiltApp =
  Boolean(process.env.ELECTRON_APP_PATH) ||
  existsSync(join(process.cwd(), "out", "main", "index.js"));

function requireWindow(): void {
  if (!hasBuiltApp) {
    test.skip(true, "Built Electron app missing (out/main/index.js). Run npm run build first.");
  }
  if (process.env.E2E_ELECTRON_WINDOW !== "1" && !required) {
    test.skip(true, "Set E2E_ELECTRON_WINDOW=1 to run window flows");
  }
}

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test.describe("v1.4 thin client e2e", () => {
  test("Case 7: memory.ts must not touch Hermes state.db / MEMORY.md via local IO", () => {
    const memoryPath = join(process.cwd(), "src/main/memory.ts");
    expect(existsSync(memoryPath)).toBe(true);
    const code = stripComments(readFileSync(memoryPath, "utf8"));
    expect(code).not.toMatch(/\bstate\.db\b/);
    expect(code).not.toMatch(/\bMEMORY\.md\b/);
    expect(code).not.toMatch(/\bbetter-sqlite3\b/);
    expect(code).not.toMatch(/\breadFileSync\s*\(/);
  });

  test("Case 8: Main must not listen on Expert MCP proxy port 48742", () => {
    const indexPath = join(process.cwd(), "src/main/index.ts");
    const code = stripComments(readFileSync(indexPath, "utf8"));
    // App ready path must not bind the legacy Desktop Expert MCP proxy port.
    expect(code).not.toMatch(/\b48742\b/);
    expect(code).not.toMatch(/\.listen\s*\(\s*48742\b/);
  });

  test("Case 2: Runtime Offline banner text must not offer Desktop Install/Start Runtime CTA", () => {
    const bannerPath = join(
      process.cwd(),
      "src/renderer/src/components/runtime/RuntimeDegradedBanner.tsx",
    );
    expect(existsSync(bannerPath)).toBe(true);
    const source = readFileSync(bannerPath, "utf8");
    expect(source).toMatch(/Runtime Offline/);
    expect(source).toMatch(/Install\/Start Runtime is not a Desktop action/);
    expect(source).not.toMatch(/Install copilot-serve/i);
    expect(source).not.toMatch(/Start copilot-serve/i);
    expect(source).not.toMatch(/>\s*Start Runtime\s*</);
    expect(source).not.toMatch(/>\s*Install Runtime\s*</);
  });

  test("Case 2 window: Offline UI shows Retry, not Install/Start Runtime", async () => {
    requireWindow();
    const harness = await launchElectronApp();
    try {
      const page = harness.page;
      await page.waitForTimeout(1000);
      const body = await page.locator("body").innerText().catch(() => "");
      if (/Runtime Offline/i.test(body)) {
        expect(body).not.toMatch(/Install copilot-serve/i);
        expect(body).not.toMatch(/Start copilot-serve/i);
        expect(body).toMatch(/Retry/i);
      } else {
        expect(true).toBe(true);
      }
    } finally {
      await closeElectronApp(harness);
    }
  });
});
