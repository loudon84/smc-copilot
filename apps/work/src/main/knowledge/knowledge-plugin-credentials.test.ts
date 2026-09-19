import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config", () => ({
  getConnectionConfig: vi.fn(() => ({ mode: "local" })),
  readEnv: vi.fn(() => ({})),
  setEnvValue: vi.fn(),
}));

vi.mock("../auth/ensure-access-token", () => ({
  ensureFreshAccessToken: vi.fn(),
}));

vi.mock("./knowledge-service-url", () => ({
  resolveKnowledgeServiceUrl: vi.fn(() => "http://localhost:4530"),
}));

vi.mock("../hermes/control-owner", () => ({
  isDirectControlOwner: vi.fn(() => true),
  isExternallyManagedControlOwner: vi.fn(() => false),
  isRuntimeControlOwner: vi.fn(() => false),
}));

vi.mock("../runtime/runtime-management-backend", () => ({
  getRuntimeManagementBackend: vi.fn(() => ({
    gatewayStatus: vi.fn(async () => false),
    restartGateway: vi.fn(async () => false),
  })),
}));

vi.mock("../runtime/runtime-manager", () => ({
  getRuntimeManager: vi.fn(() => ({
    getStatus: vi.fn(async () => ({ gatewayRunning: false })),
    restart: vi.fn(async () => ({ ok: false })),
  })),
}));

import { readEnv, setEnvValue } from "../config";
import { ensureFreshAccessToken } from "../auth/ensure-access-token";
import { resolveKnowledgeServiceUrl } from "./knowledge-service-url";
import { syncKnowledgePluginCredentialsFromPortal } from "./knowledge-plugin-credentials";

describe("syncKnowledgePluginCredentialsFromPortal (G9a)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SMC_KB_API_URL;
    delete process.env.SMC_KB_API_TOKEN;
    vi.mocked(readEnv).mockReturnValue({});
    vi.mocked(resolveKnowledgeServiceUrl).mockReturnValue(
      "http://localhost:4530",
    );
  });

  it("writes Portal token + service URL into Hermes env (not Chat context)", async () => {
    vi.mocked(ensureFreshAccessToken).mockResolvedValue("portal-jwt-abc");

    const result = await syncKnowledgePluginCredentialsFromPortal("default", {
      shouldReloadGateway: async () => false,
      reloadGateway: async () => false,
    });

    expect(result).toEqual({
      ok: true,
      url: "http://localhost:4530",
      gatewayRestarted: false,
    });
    expect(setEnvValue).toHaveBeenCalledWith(
      "SMC_KB_API_URL",
      "http://localhost:4530",
      "default",
    );
    expect(setEnvValue).toHaveBeenCalledWith(
      "SMC_KB_API_TOKEN",
      "portal-jwt-abc",
      "default",
    );
    expect(process.env.SMC_KB_API_TOKEN).toBe("portal-jwt-abc");
  });

  it("fails closed when Portal auth is missing", async () => {
    vi.mocked(ensureFreshAccessToken).mockRejectedValue(
      new Error("Not signed in"),
    );

    const result = await syncKnowledgePluginCredentialsFromPortal(undefined, {
      shouldReloadGateway: async () => false,
      reloadGateway: async () => false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("KNOWLEDGE_PLUGIN_AUTH");
    }
    expect(setEnvValue).not.toHaveBeenCalled();
  });

  it("skips gateway restart when SMC_KB_API_TOKEN is unchanged", async () => {
    vi.mocked(ensureFreshAccessToken).mockResolvedValue("same-token");
    vi.mocked(readEnv).mockReturnValue({ SMC_KB_API_TOKEN: "same-token" });
    const reloadGateway = vi.fn(async () => true);
    const shouldReloadGateway = vi.fn(async () => true);

    const result = await syncKnowledgePluginCredentialsFromPortal("default", {
      shouldReloadGateway,
      reloadGateway,
    });

    expect(result).toEqual({
      ok: true,
      url: "http://localhost:4530",
      gatewayRestarted: false,
    });
    expect(shouldReloadGateway).not.toHaveBeenCalled();
    expect(reloadGateway).not.toHaveBeenCalled();
  });

  it("restarts Work-managed local gateway when token changes", async () => {
    vi.mocked(ensureFreshAccessToken).mockResolvedValue("new-token");
    vi.mocked(readEnv).mockReturnValue({ SMC_KB_API_TOKEN: "old-token" });
    const reloadGateway = vi.fn(async () => true);
    const shouldReloadGateway = vi.fn(async () => true);

    const result = await syncKnowledgePluginCredentialsFromPortal("default", {
      shouldReloadGateway,
      reloadGateway,
    });

    expect(result).toEqual({
      ok: true,
      url: "http://localhost:4530",
      gatewayRestarted: true,
    });
    expect(shouldReloadGateway).toHaveBeenCalledWith("default");
    expect(reloadGateway).toHaveBeenCalledWith("default");
  });

  it("fails closed when token changed but gateway reload fails", async () => {
    vi.mocked(ensureFreshAccessToken).mockResolvedValue("new-token");
    vi.mocked(readEnv).mockReturnValue({ SMC_KB_API_TOKEN: "old-token" });

    const result = await syncKnowledgePluginCredentialsFromPortal("default", {
      shouldReloadGateway: async () => true,
      reloadGateway: async () => false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("KNOWLEDGE_PLUGIN_GATEWAY_RELOAD_FAILED");
    }
    expect(setEnvValue).toHaveBeenCalled();
  });
});
