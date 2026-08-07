/**
 * Run Playwright Electron E2E as required (no skip via E2E_ELECTRON_WINDOW).
 */
import { spawnSync } from "child_process";

process.env.E2E_ELECTRON_REQUIRED = "1";
process.env.E2E_ELECTRON_WINDOW = "1";

const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "playwright",
    "test",
    "-c",
    "playwright.electron.config.ts",
    "tests/e2e/chat",
  ],
  {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  },
);

process.exit(result.status ?? 1);
