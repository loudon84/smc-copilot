import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import type {
  HermesRuntimeAdapter,
  HermesRuntimeConnectionResult,
  HermesRuntimeProbe,
} from "../src/shared/runtime/runtime-contract";
import { RUNTIME_ERROR_CODES } from "../src/main/runtime/runtime-errors";

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

describe("runtime-errors", () => {
  it("maps known codes to messages", async () => {
    const { runtimeErrorMessage } = await import(
      "../src/main/runtime/runtime-errors"
    );
    expect(runtimeErrorMessage("RUNTIME_NOT_FOUND")).toContain("not found");
    expect(runtimeErrorMessage("GATEWAY_AUTH_FAILED")).toContain(
      "authentication",
    );
  });
});

describe("hermes-runtime-locator", () => {
  const base = join(tmpdir(), `runtime-loc-${Date.now()}`);

  beforeEach(() => {
    mkdirSync(base, { recursive: true });
    process.env.HERMES_HOME = base;
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.HERMES_HOME;
    rmSync(base, { recursive: true, force: true });
    vi.resetModules();
  });

  it("reports runtime missing when home is empty", async () => {
    const { locateHermesRuntime } = await import(
      "../src/main/runtime/hermes-runtime-locator"
    );
    const loc = locateHermesRuntime();
    expect(loc.runtimeFound).toBe(false);
    expect(loc.runtimeValid).toBe(false);
    expect(loc.endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it("validateHermesHomeDir requires python and hermes binaries", async () => {
    const { validateHermesHomeDir } = await import(
      "../src/main/runtime/hermes-runtime-locator"
    );
    expect(validateHermesHomeDir(base)).toBe(false);

    const venvScripts =
      process.platform === "win32"
        ? join(base, "hermes-agent", "venv", "Scripts")
        : join(base, "hermes-agent", "venv", "bin");
    mkdirSync(venvScripts, { recursive: true });
    if (process.platform === "win32") {
      writeFileSync(join(venvScripts, "python.exe"), "");
      writeFileSync(join(venvScripts, "hermes.exe"), "");
    } else {
      writeFileSync(join(venvScripts, "python"), "");
      writeFileSync(join(base, "hermes-agent", "hermes"), "");
    }
    expect(validateHermesHomeDir(base)).toBe(true);
  });
});

describe("RuntimeManager", () => {
  it("forwards probe/ensureReady and broadcasts status", async () => {
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
    const adapter: HermesRuntimeAdapter = {
      probe: vi.fn(async () => probe),
      getStatus: vi.fn(async () => probe),
      ensureReady: vi.fn(async () => connection),
      restart: vi.fn(async () => connection),
    };

    const { RuntimeManager } = await import(
      "../src/main/runtime/runtime-manager"
    );
    const manager = new RuntimeManager(adapter);
    const seen: HermesRuntimeProbe[] = [];
    manager.onStatusChanged((p) => seen.push(p));

    const result = await manager.ensureReady();
    expect(result.ok).toBe(true);
    expect(adapter.ensureReady).toHaveBeenCalled();
    expect(adapter.probe).toHaveBeenCalled();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1].state).toBe("ready");
  });

  it("adoptHome rejects invalid directories", async () => {
    const { RuntimeManager } = await import(
      "../src/main/runtime/runtime-manager"
    );
    const manager = new RuntimeManager({
      probe: async () => ({
        mode: "local",
        state: "runtime_missing",
        endpoint: "http://127.0.0.1:8642",
        runtimeFound: false,
        cliAvailable: false,
        gatewayRunning: false,
        gatewayHealthy: false,
        authenticated: false,
      }),
      getStatus: async () => ({
        mode: "local",
        state: "runtime_missing",
        endpoint: "http://127.0.0.1:8642",
        runtimeFound: false,
        cliAvailable: false,
        gatewayRunning: false,
        gatewayHealthy: false,
        authenticated: false,
      }),
      ensureReady: async () => ({
        ok: false,
        state: "runtime_missing",
        errorCode: RUNTIME_ERROR_CODES.RUNTIME_NOT_FOUND,
      }),
      restart: async () => ({
        ok: false,
        state: "runtime_missing",
        errorCode: RUNTIME_ERROR_CODES.RUNTIME_NOT_FOUND,
      }),
    });
    const result = manager.adoptHome(join(tmpdir(), "no-such-hermes-home"));
    expect(result.ok).toBe(false);
  });
});
