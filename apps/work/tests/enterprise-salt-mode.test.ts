import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

vi.mock("electron", () => ({
  app: {
    getPath: (): string => tmpdir(),
    setPath: (): void => {},
  },
  BrowserWindow: class {
    static getAllWindows(): unknown[] {
      return [];
    }
  },
}));

vi.mock("../src/main/hermes/transport/gateway-http", () => ({
  getApiUrl: (): string => "http://127.0.0.1:8642",
  isGatewayHealthy: async (): Promise<boolean> => true,
  isRemoteMode: (): boolean => false,
}));

vi.mock("../src/main/config", () => ({
  getApiServerKey: (): string => "",
}));

describe("enterprise salt mode canary (v2.3.1)", () => {
  const home = join(tmpdir(), `salt-ent-${Date.now()}`);
  const ownerDir = join(tmpdir(), `salt-owner-${Date.now()}`);
  const ownerPath = join(ownerDir, "control-owner.json");

  beforeEach(() => {
    mkdirSync(home, { recursive: true });
    mkdirSync(ownerDir, { recursive: true });
    writeFileSync(join(home, "active.json"), JSON.stringify({ version: "0.22.0" }));
    writeFileSync(ownerPath, JSON.stringify({ hermes: "salt" }));
    process.env.HERMES_HOME = home;
    process.env.SMC_CONTROL_OWNER_PATH = ownerPath;
    delete process.env.SMC_HERMES_CONTROL_OWNER;
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.HERMES_HOME;
    delete process.env.SMC_CONTROL_OWNER_PATH;
    delete process.env.SMC_HERMES_CONTROL_OWNER;
    rmSync(home, { recursive: true, force: true });
    rmSync(ownerDir, { recursive: true, force: true });
  });

  // @lat: [[runtime-connection#Salt enterprise mode canary]]
  it("uses salt control-owner and refuses local gateway restart", async () => {
    const { getHermesControlOwner, isSaltControlOwner, isRuntimeControlOwner } =
      await import("../src/main/hermes/control-owner");
    expect(getHermesControlOwner()).toBe("salt");
    expect(isSaltControlOwner()).toBe(true);
    expect(isRuntimeControlOwner()).toBe(false);

    const { HermesAvailabilityBackend } = await import(
      "../src/main/hermes/availability-backend"
    );
    const backend = new HermesAvailabilityBackend();
    const restart = await backend.restart();
    expect(restart.ok).toBe(false);
    expect(restart.errorCode).toBe("SALT_MANAGED");
  });

  it("keeps chat data-plane independent of Runtime :8765", async () => {
    const { isDirectControlOwner, isRuntimeControlOwner, getHermesControlOwner } =
      await import("../src/main/hermes/control-owner");
    expect(getHermesControlOwner()).toBe("salt");
    expect(isDirectControlOwner()).toBe(false);
    expect(isRuntimeControlOwner()).toBe(false);
  });
});
