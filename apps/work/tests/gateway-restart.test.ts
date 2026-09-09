import { afterEach, describe, expect, it, vi } from "vitest";

const { connModeRef, spawnSpy } = vi.hoisted(() => ({
  connModeRef: { mode: "local" as "local" | "remote" | "ssh" },
  spawnSpy: vi.fn(),
}));

vi.mock("../src/main/installer", () => ({
  HERMES_HOME: "/tmp/hermes-test-home",
  getEnhancedPath: () => process.env.PATH || "",
}));

vi.mock("../src/main/config", () => ({
  getModelConfig: () => ({ model: "test-model", provider: "openrouter" }),
  getApiServerKey: () => "",
  readEnv: () => ({}),
  getConnectionConfig: () => ({ mode: connModeRef.mode }),
  getConfigValue: () => "",
  setConfigValue: vi.fn(),
}));

vi.mock("../src/main/ssh-tunnel", () => ({
  getSshTunnelUrl: () => null,
  isSshTunnelActive: () => false,
  isSshTunnelHealthy: () => Promise.resolve(false),
  startSshTunnel: () => Promise.resolve(),
}));

vi.mock("../src/main/utils", () => ({
  stripAnsi: (s: string) => s,
  pidIsAliveAs: () => false,
  getActiveProfileNameSync: () => "default",
  normalizeProfileName: (profile?: string) =>
    !profile || profile === "default" ? undefined : profile,
  profileHome: () => "/tmp/hermes-test-home",
  profilePaths: () => ({
    home: "/tmp/hermes-test-home",
    configFile: "/tmp/hermes-test-home/config.yaml",
    envFile: "/tmp/hermes-test-home/.env",
    authFile: "/tmp/hermes-test-home/auth.json",
  }),
}));

vi.mock("../src/main/models", () => ({
  readModels: () => [],
}));

vi.mock("../src/main/process-options", () => ({
  HIDDEN_SUBPROCESS_OPTIONS: {},
}));

vi.mock("child_process", () => ({
  spawn: spawnSpy,
  ChildProcess: class {},
  default: { spawn: spawnSpy },
}));

import {
  restartGateway,
  restartGatewayViaCli,
  startGateway,
  startGatewayDetailed,
  startGatewayWithRecovery,
  stopGateway,
} from "../src/main/hermes";

describe("Work Gateway supervisor removal", () => {
  afterEach(() => {
    spawnSpy.mockClear();
    connModeRef.mode = "local";
  });

  it("refuses to start a local Gateway process", () => {
    const detailed = startGatewayDetailed("work");
    expect(detailed.success).toBe(false);
    expect(detailed.running).toBe(false);
    expect(startGateway("work")).toBe(false);
    expect(spawnSpy).not.toHaveBeenCalled();
  });

  it("stopGateway does not kill processes", () => {
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    stopGateway("work", true);
    expect(killSpy).not.toHaveBeenCalled();
    expect(spawnSpy).not.toHaveBeenCalled();
    killSpy.mockRestore();
  });

  it("restart and recovery do not spawn or kill Gateway", async () => {
    await expect(restartGateway("work")).resolves.toBe(false);
    await expect(restartGatewayViaCli("work")).resolves.toBe(false);
    const recovered = await startGatewayWithRecovery("work");
    expect(typeof recovered).toBe("boolean");
    expect(spawnSpy).not.toHaveBeenCalled();
  });
});
