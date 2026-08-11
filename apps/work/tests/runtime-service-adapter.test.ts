/**
 * RuntimeServiceAdapter falls back to Legacy for non-default profiles.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  HermesRuntimeConnectionResult,
  HermesRuntimeProbe,
} from "../src/shared/runtime/runtime-contract";

vi.mock("electron", () => ({
  app: {
    getPath: (): string => "/tmp",
    setPath: (): void => {},
  },
  BrowserWindow: class {
    static getAllWindows(): unknown[] {
      return [];
    }
  },
}));

describe("RuntimeServiceAdapter", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("delegates default profile to Runtime backend", async () => {
    const probe: HermesRuntimeProbe = {
      mode: "local",
      state: "ready",
      endpoint: "http://127.0.0.1:8642",
      runtimeFound: true,
      cliAvailable: true,
      gatewayRunning: true,
      gatewayHealthy: true,
      authenticated: true,
      profile: "default",
    };
    const connection: HermesRuntimeConnectionResult = {
      ok: true,
      state: "ready",
      endpoint: probe.endpoint,
      profile: "default",
    };
    const backend = {
      probe: vi.fn(async () => probe),
      ensureReady: vi.fn(async () => connection),
      restart: vi.fn(async () => connection),
      startGateway: vi.fn(),
      stopGateway: vi.fn(),
      restartGateway: vi.fn(),
      gatewayStatus: vi.fn(),
      getVersion: vi.fn(),
      doctor: vi.fn(),
      update: vi.fn(),
    };

    const { RuntimeServiceAdapter } = await import(
      "../src/main/runtime/runtime-service-adapter"
    );
    const adapter = new RuntimeServiceAdapter(backend as never);
    await expect(adapter.probe("default")).resolves.toEqual(probe);
    await expect(adapter.ensureReady()).resolves.toEqual(connection);
    expect(backend.probe).toHaveBeenCalled();
    expect(backend.ensureReady).toHaveBeenCalled();
  });
});
