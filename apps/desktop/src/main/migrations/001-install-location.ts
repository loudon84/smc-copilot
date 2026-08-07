import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

import type { DesktopInstallLocation } from "../enterprise/windows/install-location-resolver";

const CONFIG_FILENAME = "desktop-runtime.json";

export function migrateInstallLocation(location: DesktopInstallLocation): void {
  const configPath = join(location.runtimeRoot, CONFIG_FILENAME);
  mkdirSync(location.runtimeRoot, { recursive: true });

  let existing: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      existing = JSON.parse(readFileSync(configPath, "utf-8")) as Record<
        string,
        unknown
      >;
    } catch {
      /* regenerate below */
    }
  }

  const merged = {
    ...existing,
    productName: "SMC-Copilot",
    appId: "com.smc.smc-ai-copilot",
    executableName: "desktop",
    installDir: location.installDir,
    runtimeRoot: location.runtimeRoot,
    binDir: location.binDir,
    agentDir: location.agentDir,
    legacyAppIds: ["com.nousresearch.hermes"],
    appVersion: app.getVersion(),
  };

  writeFileSync(configPath, JSON.stringify(merged, null, 2), "utf-8");
}
