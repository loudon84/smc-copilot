/**
 * Electron app launch fixture for Chat E2E.
 */

import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync } from "fs";
import { join } from "path";

export type ElectronHarness = {
  app: ElectronApplication;
  page: Page;
};

function resolveMainEntry(): string {
  const fromEnv = process.env.ELECTRON_APP_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const built = join(process.cwd(), "out", "main", "index.js");
  if (existsSync(built)) return built;
  throw new Error(
    "Electron main entry not found. Build the app (npm run build) or set ELECTRON_APP_PATH.",
  );
}

export async function launchElectronApp(): Promise<ElectronHarness> {
  const main = resolveMainEntry();
  const app = await electron.launch({
    args: [main],
    env: {
      ...process.env,
      HERMES_E2E: "1",
      HERMES_USE_MOCK_AUTH: "true",
    },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page };
}

export async function closeElectronApp(harness: ElectronHarness): Promise<void> {
  await harness.app.close();
}
