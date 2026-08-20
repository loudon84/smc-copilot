import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  getApiUrl: (): string => "http://127.0.0.1:9",
  isGatewayHealthy: async (): Promise<boolean> => false,
  isRemoteMode: (): boolean => false,
}));

vi.mock("../src/main/config", () => ({
  getApiServerKey: (): string => "",
}));

describe("HermesAvailabilityBackend", () => {
  const home = join(tmpdir(), `avail-${Date.now()}`);

  beforeEach(() => {
    mkdirSync(home, { recursive: true });
    process.env.HERMES_HOME = home;
    process.env.SMC_HERMES_CONTROL_OWNER = "salt";
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.HERMES_HOME;
    delete process.env.SMC_HERMES_CONTROL_OWNER;
    rmSync(home, { recursive: true, force: true });
  });

  it("reports runtime_invalid when Hermes CLI is absent", async () => {
    const { HermesAvailabilityBackend } = await import(
      "../src/main/hermes/availability-backend"
    );
    const backend = new HermesAvailabilityBackend();
    const probe = await backend.probe();
    expect(probe.state).toBe("runtime_invalid");
    expect(probe.gatewayHealthy).toBe(false);
    expect(probe.authenticated).toBe(false);
    const ready = await backend.ensureReady();
    expect(ready.ok).toBe(false);
  });

  it("does not treat authenticated as gatewayHealthy", async () => {
    writeFileSync(
      join(home, "active.json"),
      JSON.stringify({ version: "0.1.0" }),
    );
    const { HermesAvailabilityBackend } = await import(
      "../src/main/hermes/availability-backend"
    );
    const backend = new HermesAvailabilityBackend();
    const probe = await backend.probe();
    expect(probe.authenticated).toBe(false);
    expect(probe.gatewayHealthy).toBe(false);
  });

  it("refuses restart in salt mode", async () => {
    writeFileSync(join(home, "active.json"), JSON.stringify({ version: "0.1.0" }));
    const { HermesAvailabilityBackend } = await import(
      "../src/main/hermes/availability-backend"
    );
    const backend = new HermesAvailabilityBackend();
    const result = await backend.restart();
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("SALT_MANAGED");
  });
});
