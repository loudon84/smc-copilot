import { copyFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { app } from "electron";
import type { McpBridgeStatus } from "../../shared/mcp/mcp-contract";
import { profileHome, safeWriteFile } from "../utils";
import { isGatewayRunning } from "../hermes";
import { exportProfileBindings } from "./mcp-skill-binding-service";
import { getMcpProxyUrl, isMcpProxyRunning, startMcpRuntimeProxy } from "./mcp-runtime-proxy";

const BRIDGE_SKILL_NAME = "mcp-skill-bridge";

function bundledBridgeDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "skills", "system", BRIDGE_SKILL_NAME);
  }
  return join(app.getAppPath(), "resources", "skills", "system", BRIDGE_SKILL_NAME);
}

function profileBridgeDir(profile: string): string {
  return join(profileHome(profile), "skills", "system", BRIDGE_SKILL_NAME);
}

function copyDirRecursive(src: string, dest: string): void {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  const files = ["SKILL.md", "bridge.py", "README.md", "bridge_config.schema.json"];
  for (const f of files) {
    const from = join(src, f);
    if (existsSync(from)) {
      copyFileSync(from, join(dest, f));
    }
  }
}

export function checkBridge(profile: string): McpBridgeStatus {
  const dir = profileBridgeDir(profile);
  const installed = existsSync(join(dir, "SKILL.md"));
  const bindingsPath = join(profileHome(profile), "mcp_skill_bindings.json");
  return {
    profile,
    installed,
    skillPath: installed ? dir : null,
    proxyUrl: getMcpProxyUrl(),
    bindingsPath: existsSync(bindingsPath) ? bindingsPath : null,
    gatewayRestartRecommended: isGatewayRunning(),
  };
}

export async function installBridge(profile: string): Promise<McpBridgeStatus> {
  if (!isMcpProxyRunning()) {
    await startMcpRuntimeProxy();
  }

  const dest = profileBridgeDir(profile);
  copyDirRecursive(bundledBridgeDir(), dest);

  const configPath = join(dest, "bridge_config.json");
  safeWriteFile(
    configPath,
    JSON.stringify(
      {
        profile,
        proxy_url: getMcpProxyUrl(),
      },
      null,
      2,
    ),
  );

  const bindingsPath = exportProfileBindings(profile);

  return {
    profile,
    installed: existsSync(join(dest, "SKILL.md")),
    skillPath: dest,
    proxyUrl: getMcpProxyUrl(),
    bindingsPath,
    gatewayRestartRecommended: isGatewayRunning(),
  };
}

export function ensureDefaultBridgeSkill(): void {
  const defaultDir = profileBridgeDir("default");
  if (!existsSync(join(defaultDir, "SKILL.md"))) {
    copyDirRecursive(bundledBridgeDir(), defaultDir);
  }
}
