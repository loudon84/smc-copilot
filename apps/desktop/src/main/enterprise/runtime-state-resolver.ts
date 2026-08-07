import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { app } from "electron";

import type { RuntimeState } from "../../shared/enterprise/runtime-state-contract";
import type { DesktopRuntimeState } from "../../shared/enterprise/migration-contract";
import { resolveInstallLocation } from "./windows/install-location-resolver";
import { resolveRuntimePaths } from "./windows/path-resolver";
import { resolveCopilotRuntimePaths } from "../runtime/runtime-paths";
import { readRuntimeConfig } from "./desktop-runtime-config";
import { existsInstallMarker } from "./install-marker";
import { isModelConfigured } from "./model-config-status";

const REGISTRY_KEY_PRIMARY = "HKCU\\Software\\SMC\\copilot";
const REGISTRY_KEY_LEGACY = "HKCU\\Software\\SMC\\Copilot";

function hasProjectFiles(dir: string): boolean {
  return (
    existsSync(join(dir, "pyproject.toml")) || existsSync(join(dir, "setup.py"))
  );
}

function readRegistryValue(key: string, valueName: string): string | null {
  if (process.platform !== "win32") return null;

  try {
    const result = execFileSync(
      "reg",
      ["query", key, "/v", valueName],
      { encoding: "utf-8", timeout: 5000 },
    ).trim();

    const match = result.match(
      new RegExp(`${valueName}\\s+REG_(?:SZ|EXPAND_SZ)\\s+(.+)`, "i"),
    );
    if (match?.[1]) {
      return match[1].trim();
    }
  } catch {
    /* registry not found */
  }

  return null;
}

function readDesktopRuntimeState(
  runtimeRoot: string,
): DesktopRuntimeState | null {
  const statePath = join(runtimeRoot, "desktop-runtime-state.json");
  if (!existsSync(statePath)) return null;

  try {
    return JSON.parse(readFileSync(statePath, "utf-8")) as DesktopRuntimeState;
  } catch {
    return null;
  }
}

function detectUpdateMode(runtimeRoot: string): boolean {
  const configPath = join(runtimeRoot, "desktop-runtime.json");
  if (!existsSync(configPath) && !readRuntimeConfig()) {
    return false;
  }

  const previousVersion =
    readRegistryValue(REGISTRY_KEY_PRIMARY, "PreviousVersion") ??
    readRegistryValue(REGISTRY_KEY_LEGACY, "PreviousVersion");
  if (previousVersion) return true;

  if (existsInstallMarker()) return true;

  const runtimeState = readDesktopRuntimeState(runtimeRoot);
  const currentVersion = app.getVersion();
  if (
    runtimeState?.previousAppVersion &&
    runtimeState.previousAppVersion !== currentVersion
  ) {
    return true;
  }

  if (
    runtimeState?.appVersion &&
    runtimeState.appVersion !== currentVersion
  ) {
    return true;
  }

  return false;
}

export function resolveRuntimeState(): RuntimeState {
  const loc = resolveInstallLocation();
  const paths = resolveRuntimePaths();
  const runtimePaths = resolveCopilotRuntimePaths();
  const agentPath = loc.hermesSourceRoot;

  const agentSourceExists =
    existsSync(agentPath) && hasProjectFiles(agentPath);
  const venvExists = existsSync(runtimePaths.hermesVenv);
  const hermesCliExists = existsSync(paths.hermesScript);
  const modelConfigured = isModelConfigured();
  const runtimeReady =
    agentSourceExists && venvExists && hermesCliExists;
  const updateMode = detectUpdateMode(loc.runtimeRoot);

  return {
    installDir: loc.installDir,
    agentPath,
    agentSourceExists,
    venvExists,
    hermesCliExists,
    modelConfigured,
    runtimeReady,
    needsAgentInstall: !runtimeReady,
    needsModelSetup: !modelConfigured,
    updateMode,
  };
}
