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

describe("enterprise opsi mode canary", () => {
  const home = join(tmpdir(), `opsi-ent-${Date.now()}`);
  const ownerDir = join(tmpdir(), `opsi-owner-${Date.now()}`);
  const ownerPath = join(ownerDir, "control-owner.json");

  beforeEach(() => {
    mkdirSync(home, { recursive: true });
    mkdirSync(ownerDir, { recursive: true });
    writeFileSync(join(home, "active.json"), JSON.stringify({ version: "0.22.0" }));
    writeFileSync(ownerPath, JSON.stringify({ hermes: "opsi" }));
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

  // @lat: [[runtime-connection#OPSI enterprise mode canary]]
  it("observes opsi with effective direct and does not block local gates", async () => {
    const {
      getHermesControlOwner,
      getEffectiveControlOwner,
      isOpsiControlOwner,
      isSaltControlOwner,
      isRuntimeControlOwner,
      isExternallyManagedControlOwner,
      isDirectControlOwner,
      readControlOwnerSnapshot,
    } = await import("../src/main/hermes/control-owner");
    expect(getHermesControlOwner()).toBe("opsi");
    expect(getEffectiveControlOwner()).toBe("direct");
    expect(isOpsiControlOwner()).toBe(true);
    expect(isSaltControlOwner()).toBe(false);
    expect(isRuntimeControlOwner()).toBe(false);
    expect(isExternallyManagedControlOwner()).toBe(false);
    expect(isDirectControlOwner()).toBe(true);
    expect(readControlOwnerSnapshot()).toMatchObject({
      observed: "opsi",
      effective: "direct",
      owner: "opsi",
    });

    // Historical AvailabilityBackend still refuses restart when constructed directly.
    const { HermesAvailabilityBackend } = await import(
      "../src/main/hermes/availability-backend"
    );
    const backend = new HermesAvailabilityBackend();
    const restart = await backend.restart();
    expect(restart.ok).toBe(false);
    expect(restart.errorCode).toBe("EXTERNALLY_MANAGED");
    expect(restart.errorMessage).toMatch(/OPSI/);
  });

  it("keeps chat data-plane independent of Runtime :8765 and opsi-control", async () => {
    const {
      isDirectControlOwner,
      isRuntimeControlOwner,
      getHermesControlOwner,
      getEffectiveControlOwner,
    } = await import("../src/main/hermes/control-owner");
    expect(getHermesControlOwner()).toBe("opsi");
    expect(getEffectiveControlOwner()).toBe("direct");
    expect(isDirectControlOwner()).toBe(true);
    expect(isRuntimeControlOwner()).toBe(false);
  });

  it("continues Availability probe when OPSI control is offline and Gateway is healthy", async () => {
    const { HermesAvailabilityBackend } = await import(
      "../src/main/hermes/availability-backend"
    );
    const backend = new HermesAvailabilityBackend();
    const probe = await backend.probe();
    expect(probe.gatewayHealthy).toBe(true);
    expect(probe.endpoint).toContain("8642");
    expect(probe.errorCode).not.toBe("OPSI_UNAVAILABLE");
    const restart = await backend.restart();
    expect(restart.ok).toBe(false);
    expect(restart.errorCode).toBe("EXTERNALLY_MANAGED");
  });

  // @lat: [[runtime-connection#OPSI owner / lifecycle]]
  it("keeps NativeHermesRuntimeAdapter identity when control owner is opsi", async () => {
    const { getRuntimeManager, RUNTIME_ADAPTER_ID } = await import(
      "../src/main/runtime/runtime-manager"
    );
    const manager = getRuntimeManager();
    expect(manager.getAdapterIdentity().adapter).toBe(RUNTIME_ADAPTER_ID);
    expect(RUNTIME_ADAPTER_ID).toBe("native-hermes");
  });
});
