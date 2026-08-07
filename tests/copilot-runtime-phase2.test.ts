import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp/copilot-runtime-phase2-test",
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

vi.mock("keytar", () => ({
  default: {
    getPassword: vi.fn(async () => null),
    setPassword: vi.fn(async () => undefined),
    deletePassword: vi.fn(async () => true),
  },
}));

const runtimeFetchMock = vi.fn();

vi.mock("../src/main/copilot-runtime-client/runtime-http-client", async () => {
  const actual = await vi.importActual<
    typeof import("../src/main/copilot-runtime-client/runtime-http-client")
  >("../src/main/copilot-runtime-client/runtime-http-client");
  return {
    ...actual,
    runtimeFetch: (...args: unknown[]) => runtimeFetchMock(...args),
  };
});

vi.mock("../src/main/copilot-runtime-client/runtime-connection-manager", () => ({
  getRuntimeConnectionState: () => ({
    state: "Ready",
    ready: true,
    paired: true,
    baseUrl: "http://127.0.0.1:8765",
    port: 8765,
    deviceId: "dev-1",
    runtimeVersion: "1.6.1",
    runtimeApiVersion: "1.3",
    hermesVersion: null,
    compatibility: null,
    lastError: null,
    lastErrorCode: null,
    canRetry: true,
    canRepair: false,
    canPair: false,
    updatedAt: new Date().toISOString(),
  }),
}));

import {
  isLegacyHermesDirectAllowed,
  isServeControlPlaneEnabled,
  isServeControlPlanePreferred,
} from "../src/main/copilot-runtime-client/runtime-mode";
import { instanceClient } from "../src/main/copilot-runtime-client/clients/instance-client";
import { sanitizeSecretMeta } from "../src/main/copilot-runtime-client/clients/secrets-client";
import { ServeInstanceAdapter } from "../src/main/runtime-adapters/ServeInstanceAdapter";
import {
  resolveGatewayControlMode,
} from "../src/main/runtime-adapters/gateway-control";
import { assertLegacyYamlControlPlane } from "../src/main/runtime-adapters/config-control";

describe("Phase 2 control plane flags", () => {
  // @lat: [[serve-runtime-tests#Serve-First Runtime tests#Prefers Serve control plane unless legacy-direct]]
  it("prefers Serve unless legacy-direct", () => {
    expect(
      isServeControlPlanePreferred({ COPILOT_ALLOW_LEGACY_HERMES_DIRECT: undefined }, "development"),
    ).toBe(true);
    expect(
      isServeControlPlanePreferred({ COPILOT_ALLOW_LEGACY_HERMES_DIRECT: "true" }, "development"),
    ).toBe(false);
    expect(isLegacyHermesDirectAllowed({ NODE_ENV: "production" }, "production")).toBe(false);
  });

  it("enables Serve CP only when Ready and not legacy", () => {
    expect(isServeControlPlaneEnabled(true, {}, "development")).toBe(true);
    expect(isServeControlPlaneEnabled(false, {}, "development")).toBe(false);
    expect(
      isServeControlPlaneEnabled(true, { COPILOT_ALLOW_LEGACY_HERMES_DIRECT: "1" }, "development"),
    ).toBe(false);
  });

  it("resolveGatewayControlMode is serve when Ready", () => {
    expect(resolveGatewayControlMode()).toBe("serve");
  });
});

describe("instanceClient.resolve", () => {
  beforeEach(() => {
    runtimeFetchMock.mockReset();
    ServeInstanceAdapter.clearCache();
  });

  // @lat: [[serve-runtime-tests#Serve-First Runtime tests#Serve Instance resolve maps profile ref]]
  it("maps profile ref to instanceId", async () => {
    runtimeFetchMock.mockResolvedValueOnce({
      instance_id: "inst-abc",
      matched_by: "profile_name",
    });
    const result = await instanceClient.resolve("default");
    expect(result.instanceId).toBe("inst-abc");
    expect(result.ref).toBe("default");
    expect(runtimeFetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/v1/instances/resolve",
        query: { ref: "default" },
      }),
    );
  });

  it("ServeInstanceAdapter caches resolve", async () => {
    runtimeFetchMock.mockResolvedValueOnce({
      instanceId: "inst-1",
      matchedBy: "profileId",
    });
    const a = await ServeInstanceAdapter.resolveRef("coding");
    const b = await ServeInstanceAdapter.resolveRef("coding");
    expect(a.instanceId).toBe("inst-1");
    expect(b.instanceId).toBe("inst-1");
    expect(runtimeFetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("secrets sanitization", () => {
  it("never forwards plaintext value fields", () => {
    const sanitized = sanitizeSecretMeta({
      name: "OPENAI_API_KEY",
      configured: true,
      source: "user",
      updatedAt: "2026-01-01",
      // @ts-expect-error intentional garbage field
      value: "sk-secret",
      // @ts-expect-error intentional garbage field
      secret: "should-not-leak",
    });
    expect(sanitized).toEqual({
      name: "OPENAI_API_KEY",
      configured: true,
      source: "user",
      updatedAt: "2026-01-01",
    });
    expect(JSON.stringify(sanitized)).not.toContain("sk-secret");
  });
});

describe("YAML control plane guard", () => {
  // @lat: [[serve-runtime-tests#Serve-First Runtime tests#YAML write blocked when Serve preferred]]
  it("blocks writeHermesConfig path when Serve preferred", () => {
    expect(() => assertLegacyYamlControlPlane("writeHermesConfig")).toThrow(/Serve control plane/);
  });

  it("allows YAML when legacy-direct", () => {
    const prev = process.env.COPILOT_ALLOW_LEGACY_HERMES_DIRECT;
    process.env.COPILOT_ALLOW_LEGACY_HERMES_DIRECT = "true";
    try {
      expect(() => assertLegacyYamlControlPlane("writeHermesConfig")).not.toThrow();
    } finally {
      if (prev === undefined) delete process.env.COPILOT_ALLOW_LEGACY_HERMES_DIRECT;
      else process.env.COPILOT_ALLOW_LEGACY_HERMES_DIRECT = prev;
    }
  });
});

describe("gateway control mode with mocked Ready", () => {
  beforeEach(() => {
    runtimeFetchMock.mockReset();
    ServeInstanceAdapter.clearCache();
  });

  // @lat: [[serve-runtime-tests#Serve-First Runtime tests#Serve Instance start awaits real ok]]
  it("start routes via Serve adapter without throwing on mocked fetch", async () => {
    runtimeFetchMock.mockResolvedValueOnce({ instance_id: "inst-default" });
    runtimeFetchMock.mockResolvedValueOnce({ ok: true });
    const result = await ServeInstanceAdapter.start("default");
    expect(result.ok).toBe(true);
    expect(runtimeFetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/api/v1/instances/inst-default/start",
      }),
    );
  });

  it("serveStartGateway awaits Serve and returns ok", async () => {
    const { serveStartGateway } = await import("../src/main/runtime-adapters/gateway-control");
    runtimeFetchMock.mockResolvedValueOnce({ instance_id: "inst-gw" });
    runtimeFetchMock.mockResolvedValueOnce({ ok: true });
    await expect(serveStartGateway("default")).resolves.toBe(true);
  });

  // @lat: [[serve-runtime-tests#Serve-First Runtime tests#Serve Instance health drives running status]]
  it("ServeInstanceAdapter.health maps instance health", async () => {
    runtimeFetchMock.mockResolvedValueOnce({
      instance_id: "inst-h",
      status: "running",
      healthy: true,
      checks: {},
      message: null,
    });
    const health = await ServeInstanceAdapter.health("inst-h");
    expect(health.healthy).toBe(true);
    expect(health.status).toBe("running");
  });
});

describe("Phase 2 hardening guards", () => {
  it("Serve preferred skips claiming YAML MCP registration path", async () => {
    const { isServeControlPlanePreferred } = await import(
      "../src/main/copilot-runtime-client/runtime-mode"
    );
    expect(isServeControlPlanePreferred()).toBe(true);
  });
});
