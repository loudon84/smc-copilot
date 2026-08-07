import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const { TEST_USER_DATA } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("os");
  return {
    TEST_USER_DATA: path.join(os.tmpdir(), `mcp-skill-gateway-config-${Date.now()}`),
  };
});

vi.mock("electron", () => ({
  app: {
    getPath: (name: string) => (name === "userData" ? TEST_USER_DATA : "/tmp"),
  },
}));

vi.mock("../src/main/auth/auth-endpoint-config-store", () => ({
  readAuthEndpointConfig: () => ({
    backendUrl: "http://192.168.0.118:4510",
    authPrefix: "/api/v1/auth",
    aiosHomeUrl: "http://192.168.0.118:4517",
  }),
}));

import {
  getMcpSkillGatewayConfig,
  resetMcpSkillGatewayConfig,
  resolveBackendBaseUrl,
  resolveRemoteMcpUrl,
  saveMcpSkillGatewayConfig,
} from "../src/main/mcp-skill-gateway-runtime/mcp-skill-gateway-config";
import { DEFAULT_MCP_SKILL_GATEWAY_CONFIG } from "../src/shared/mcp-skill-gateway-runtime/mcp-skill-gateway-runtime-contract";

beforeEach(() => {
  mkdirSync(TEST_USER_DATA, { recursive: true });
  resetMcpSkillGatewayConfig();
});

afterEach(() => {
  if (existsSync(TEST_USER_DATA)) {
    rmSync(TEST_USER_DATA, { recursive: true, force: true });
  }
});

describe("mcp-skill-gateway config store", () => {
  it("returns defaults without persisted backendBaseUrl", () => {
    const config = getMcpSkillGatewayConfig();
    expect(config.enabled).toBe(DEFAULT_MCP_SKILL_GATEWAY_CONFIG.enabled);
    expect(config.localProxyPort).toBe(48742);
    expect("backendBaseUrl" in config).toBe(false);
    expect(config.registeredProfiles).toEqual(["default"]);
    expect(resolveBackendBaseUrl()).toBe("http://192.168.0.118:4510");
    expect(resolveRemoteMcpUrl()).toBe("http://192.168.0.118:4510/api/v1/hermes/mcp");
  });

  it("ignores legacy backendBaseUrl in stored config", () => {
    writeFileSync(
      join(TEST_USER_DATA, "mcp-skill-gateway-runtime-config.json"),
      JSON.stringify({
        enabled: true,
        backendBaseUrl: "http://192.168.0.110:8000",
        localProxyPort: 48742,
      }),
    );
    const config = getMcpSkillGatewayConfig();
    expect("backendBaseUrl" in config).toBe(false);
    expect(resolveBackendBaseUrl()).toBe("http://192.168.0.118:4510");
  });

  it("merges saveConfig patches", () => {
    const saved = saveMcpSkillGatewayConfig({
      autoRestartHermesGateway: true,
      localProxyPort: 49999,
    });
    expect(saved.autoRestartHermesGateway).toBe(true);
    expect(saved.localProxyPort).toBe(49999);
    expect(saved.updatedAt).not.toBe("");

    const reloaded = getMcpSkillGatewayConfig();
    expect(reloaded.localProxyPort).toBe(49999);
  });

  it("resetConfig restores defaults", () => {
    saveMcpSkillGatewayConfig({ enabled: false });
    resetMcpSkillGatewayConfig();
    const config = getMcpSkillGatewayConfig();
    expect(config.enabled).toBe(true);
    expect(existsSync(join(TEST_USER_DATA, "mcp-skill-gateway-runtime-config.json"))).toBe(
      false,
    );
  });
});
