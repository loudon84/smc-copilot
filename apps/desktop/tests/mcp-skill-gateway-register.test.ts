import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";

const { TEST_HOME } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("os");
  return {
    TEST_HOME: path.join(os.tmpdir(), `mcp-skill-gateway-register-${Date.now()}`),
  };
});

vi.mock("../src/main/installer", () => ({
  HERMES_HOME: TEST_HOME,
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => TEST_HOME,
  },
}));

vi.mock("../src/main/auth/auth-endpoint-config-store", () => ({
  readAuthEndpointConfig: () => ({
    backendUrl: "http://192.168.0.118:4510",
    authPrefix: "/api/v1/auth",
    aiosHomeUrl: "http://192.168.0.118:4517",
  }),
}));

vi.mock("../src/main/profiles", () => ({
  listProfiles: () => [{ name: "writer", isDefault: false, hasEnv: true }],
}));

vi.mock("../src/main/mcp-skill-gateway-runtime/mcp-skill-gateway-proxy", () => ({
  isMcpSkillGatewayProxyRunning: () => true,
}));

vi.mock("../src/main/mcp-skill-gateway-runtime/mcp-skill-gateway-health", () => ({
  testMcpSkillGatewayProxy: async () => ({
    ok: true,
    service: "mcp-skill-gateway-proxy",
    loggedIn: true,
    backendBaseUrl: "http://192.168.0.118:4510",
    remoteMcpUrl: "http://192.168.0.118:4510/api/v1/hermes/mcp",
    localMcpUrl: "http://127.0.0.1:48742/mcp?profile=default",
  }),
}));

import {
  listMcpSkillGatewayProfileRegistrations,
  registerMcpSkillGatewayToHermes,
  unregisterMcpSkillGatewayFromHermes,
} from "../src/main/mcp-skill-gateway-runtime/mcp-skill-gateway-register";

beforeEach(() => {
  mkdirSync(TEST_HOME, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_HOME)) {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});

describe("mcp-skill-gateway Hermes registration", () => {
  it("writes mcp_skill_gateway without destroying existing mcp_servers", async () => {
    const configPath = join(TEST_HOME, "config.yaml");
    writeFileSync(
      configPath,
      yaml.dump({
        provider: "custom",
        mcp_servers: {
          existing_server: {
            enabled: true,
            type: "http",
            url: "http://127.0.0.1:9000/mcp",
          },
        },
      }),
    );

    const result = await registerMcpSkillGatewayToHermes({
      profile: "default",
      localProxyPort: 48742,
      enabled: true,
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.ready).toBe(true);
    expect(result.urlMatched).toBe(true);
    expect(result.backendMatched).toBe(true);
    const doc = yaml.load(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const servers = doc.mcp_servers as Record<string, Record<string, unknown>>;
    expect(servers.existing_server.url).toBe("http://127.0.0.1:9000/mcp");
    expect(servers.mcp_skill_gateway).toEqual({
      enabled: true,
      type: "http",
      url: "http://127.0.0.1:48742/mcp?profile=default",
    });
    expect(JSON.stringify(doc)).not.toContain("Authorization");
  });

  it("is idempotent when registration unchanged", async () => {
    const configPath = join(TEST_HOME, "config.yaml");
    writeFileSync(
      configPath,
      yaml.dump({
        mcp_servers: {
          mcp_skill_gateway: {
            enabled: true,
            type: "http",
            url: "http://127.0.0.1:48742/mcp?profile=default",
          },
        },
      }),
    );

    const result = await registerMcpSkillGatewayToHermes({
      profile: "default",
      localProxyPort: 48742,
      enabled: true,
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.ready).toBe(true);
  });

  it("unregister sets enabled=false", async () => {
    const configPath = join(TEST_HOME, "config.yaml");
    writeFileSync(
      configPath,
      yaml.dump({
        mcp_servers: {
          mcp_skill_gateway: {
            enabled: true,
            type: "http",
            url: "http://127.0.0.1:48742/mcp?profile=default",
          },
        },
      }),
    );

    const result = await unregisterMcpSkillGatewayFromHermes("default");
    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);

    const doc = yaml.load(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const entry = (doc.mcp_servers as Record<string, Record<string, unknown>>)
      .mcp_skill_gateway;
    expect(entry.enabled).toBe(false);
  });

  it("lists registration consistency fields", () => {
    const configPath = join(TEST_HOME, "config.yaml");
    writeFileSync(
      configPath,
      yaml.dump({
        mcp_servers: {
          mcp_skill_gateway: {
            enabled: true,
            type: "http",
            url: "http://127.0.0.1:48742/mcp?profile=default",
          },
        },
      }),
    );

    const rows = listMcpSkillGatewayProfileRegistrations();
    const row = rows.find((item) => item.profile === "default");
    expect(row?.expectedUrl).toBe("http://127.0.0.1:48742/mcp?profile=default");
    expect(row?.urlMatched).toBe(true);
    expect(row?.backendMatched).toBe(true);
    expect(row?.ready).toBe(true);
  });
});
