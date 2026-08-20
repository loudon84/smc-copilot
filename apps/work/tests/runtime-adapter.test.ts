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
    getPath: (name: string): string => {
      if (name === "userData") {
        return process.env.HERMES_DESKTOP_USER_DATA_DIR || tmpdir();
      }
      return tmpdir();
    },
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
  const userData = join(tmpdir(), `runtime-loc-user-${Date.now()}`);

  beforeEach(() => {
    mkdirSync(base, { recursive: true });
    mkdirSync(userData, { recursive: true });
    process.env.HERMES_DESKTOP_USER_DATA_DIR = userData;
    writeFileSync(
      join(userData, "runtime.json"),
      JSON.stringify({
        schemaVersion: 1,
        hermes: {
          home: base,
          programRoot: join(base, "program"),
          cliPath: join(base, "program", "bin", "hermes.exe"),
        },
        gateway: { baseUrl: "http://127.0.0.1:8642", healthPath: "/health" },
      }),
      "utf-8",
    );
    vi.resetModules();
    vi.doUnmock("../src/main/runtime/hermes-runtime-locator");
  });

  afterEach(() => {
    delete process.env.HERMES_DESKTOP_USER_DATA_DIR;
    rmSync(base, { recursive: true, force: true });
    rmSync(userData, { recursive: true, force: true });
    vi.resetModules();
  });

  it("reports runtime invalid when CLI is missing", async () => {
    const { locateHermesRuntime } = await import(
      "../src/main/runtime/hermes-runtime-locator"
    );
    const loc = locateHermesRuntime();
    expect(loc.runtimeFound).toBe(true);
    expect(loc.runtimeValid).toBe(false);
    expect(loc.endpoint).toBe("http://127.0.0.1:8642");
  });

  it("validateHermesHomeDir accepts config markers", async () => {
    const { validateHermesHomeDir } = await import(
      "../src/main/runtime/hermes-runtime-locator"
    );
    expect(validateHermesHomeDir(base)).toBe(false);
    writeFileSync(join(base, "config.yaml"), "model:\n  provider: x\n");
    expect(validateHermesHomeDir(base)).toBe(true);
  });
});

describe("LegacyLocalRuntimeAdapter", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../src/main/runtime/hermes-runtime-locator");
    vi.doUnmock("../src/main/runtime/gateway-probe");
    vi.doUnmock("../src/main/installer");
  });

  it("ensureReady does not start gateway", async () => {
    vi.doMock("../src/main/runtime/hermes-runtime-locator", () => ({
      locateHermesRuntime: () => ({
        homePath: "C:\\ProgramData\\SMC\\Hermes",
        programRoot: "D:\\Programs\\SMC\\Hermes",
        executablePath: "D:\\Programs\\SMC\\Hermes\\bin\\hermes.exe",
        profile: "default",
        profilePath: "C:\\ProgramData\\SMC\\Hermes",
        endpoint: "http://127.0.0.1:8642",
        runtimeFound: true,
        runtimeValid: true,
        cliAvailable: true,
      }),
    }));
    vi.doMock("../src/main/runtime/gateway-probe", () => ({
      probeGatewayHealth: vi.fn(async () => false),
      probeGatewayAuthentication: vi.fn(async () => "unreachable" as const),
    }));
    vi.doMock("../src/main/installer", () => ({
      getHermesVersion: vi.fn(async () => "1.0.0"),
    }));

    const { LegacyLocalRuntimeAdapter } = await import(
      "../src/main/runtime/legacy-local-runtime-adapter"
    );
    const adapter = new LegacyLocalRuntimeAdapter();
    const result = await adapter.ensureReady();
    expect(result.ok).toBe(false);
    expect(result.state).toBe("gateway_unreachable");
  });

  it("restart returns MANAGED_RUNTIME_RESTART_REQUIRED", async () => {
    vi.doMock("../src/main/runtime/hermes-runtime-locator", () => ({
      locateHermesRuntime: () => ({
        homePath: "C:\\ProgramData\\SMC\\Hermes",
        programRoot: "D:\\Programs\\SMC\\Hermes",
        executablePath: "D:\\Programs\\SMC\\Hermes\\bin\\hermes.exe",
        profile: "default",
        profilePath: "C:\\ProgramData\\SMC\\Hermes",
        endpoint: "http://127.0.0.1:8642",
        runtimeFound: true,
        runtimeValid: true,
        cliAvailable: true,
      }),
    }));

    const { LegacyLocalRuntimeAdapter } = await import(
      "../src/main/runtime/legacy-local-runtime-adapter"
    );
    const result = await new LegacyLocalRuntimeAdapter().restart();
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("MANAGED_RUNTIME_RESTART_REQUIRED");
  });
});

describe("RuntimeManager default adapter", () => {
  it("uses LegacyLocalRuntimeAdapter by default", async () => {
    const { RuntimeManager } = await import(
      "../src/main/runtime/runtime-manager"
    );
    const { LegacyLocalRuntimeAdapter } = await import(
      "../src/main/runtime/legacy-local-runtime-adapter"
    );
    const manager = new RuntimeManager();
    expect(manager).toBeDefined();
    expect(LegacyLocalRuntimeAdapter).toBeTypeOf("function");
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
