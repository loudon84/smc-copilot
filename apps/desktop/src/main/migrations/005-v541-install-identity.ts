import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import type { DesktopInstallLocation } from "../enterprise/windows/install-location-resolver";

const CONFIG_FILENAME = "desktop-runtime.json";

const CANONICAL_IDENTITY = {
  productName: "SMC-Copilot",
  appId: "com.smc.smc-ai-copilot",
  executableName: "desktop",
  registryKey: "HKCU\\Software\\SMC\\copilot",
  legacyProductNames: ["SMC Copilot", "CopilotSMC", "HermesDesktop"],
  legacyAppIds: ["com.nousresearch.hermes"],
} as const;

/** V5.4.1 — refresh install identity in desktop-runtime.json without clobbering user fields. */
export function migrateV541InstallIdentity(
  location: DesktopInstallLocation,
): void {
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
    ...CANONICAL_IDENTITY,
    installDir: location.installDir,
    runtimeRoot: location.runtimeRoot,
    binDir: location.binDir,
    agentDir: location.agentDir,
  };

  writeFileSync(configPath, JSON.stringify(merged, null, 2), "utf-8");
}
