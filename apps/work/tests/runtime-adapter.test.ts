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

  function locatorMock(overrides: Record<string, unknown> = {}) {
    return {
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
        ...overrides,
      }),
    };
  }

  function gatewayProbeMock(overrides: Record<string, unknown> = {}) {
    return {
      probeGatewayHealth: vi.fn(async () => true),
      probeGatewayAuthentication: vi.fn(async () => "ok" as const),
      inspectGatewayListener: vi.fn(async () => ({ status: "match" as const })),
      parseGatewayListenPort: (endpoint: string) => {
        try {
          const port = new URL(endpoint).port;
          return port ? Number(port) : 80;
        } catch {
          return null;
        }
      },
      ...overrides,
    };
  }

  it("maps home missing to runtime_missing", async () => {
    vi.doMock("../src/main/runtime/hermes-runtime-locator", () =>
      locatorMock({ runtimeFound: false, runtimeValid: false, cliAvailable: false }),
    );
    const { LegacyLocalRuntimeAdapter } = await import(
      "../src/main/runtime/legacy-local-runtime-adapter"
    );
    const probe = await new LegacyLocalRuntimeAdapter().probe();
    expect(probe.state).toBe("runtime_missing");
    expect(probe.errorCode).toBe("RUNTIME_NOT_FOUND");
  });

  it("keeps CLI missing as runtime_invalid even when Gateway is healthy", async () => {
    vi.doMock("../src/main/runtime/hermes-runtime-locator", () =>
      locatorMock({
        runtimeFound: true,
        runtimeValid: true,
        cliAvailable: false,
      }),
    );
    vi.doMock("../src/main/runtime/gateway-probe", () => ({
      probeGatewayHealth: vi.fn(async () => true),
      probeGatewayAuthentication: vi.fn(async () => "ok" as const),
    }));
    vi.doMock("../src/main/installer", () => ({
      getHermesVersion: vi.fn(async () => null),
    }));
    const { LegacyLocalRuntimeAdapter } = await import(
      "../src/main/runtime/legacy-local-runtime-adapter"
    );
    const probe = await new LegacyLocalRuntimeAdapter().probe();
    expect(probe.state).toBe("runtime_invalid");
    expect(probe.gatewayHealthy).toBe(false);
  });

  it("maps auth failure to gateway_auth_failed", async () => {
    vi.doMock("../src/main/runtime/hermes-runtime-locator", () => locatorMock());
    vi.doMock("../src/main/runtime/gateway-probe", () => ({
      probeGatewayHealth: vi.fn(async () => true),
      probeGatewayAuthentication: vi.fn(async () => "unauthorized" as const),
    }));
    vi.doMock("../src/main/installer", () => ({
      getHermesVersion: vi.fn(async () => "1.0.0"),
    }));
    const { LegacyLocalRuntimeAdapter } = await import(
      "../src/main/runtime/legacy-local-runtime-adapter"
    );
    const probe = await new LegacyLocalRuntimeAdapter().probe();
    expect(probe.state).toBe("gateway_auth_failed");
    expect(probe.authenticated).toBe(false);
  });

  it("maps full ready when CLI, health, and auth succeed", async () => {
    vi.doMock("../src/main/runtime/hermes-runtime-locator", () => locatorMock());
    vi.doMock("../src/main/runtime/gateway-probe", () => gatewayProbeMock());
    vi.doMock("../src/main/installer", () => ({
      getHermesVersion: vi.fn(async () => "1.0.0"),
    }));
    const { LegacyLocalRuntimeAdapter } = await import(
      "../src/main/runtime/legacy-local-runtime-adapter"
    );
    const probe = await new LegacyLocalRuntimeAdapter().probe();
    expect(probe.state).toBe("ready");
    expect(probe.authenticated).toBe(true);
    expect(probe.gatewayHealthy).toBe(true);
    expect(probe.runtimeContextVerified).toBe(true);
  });

  it("maps listen mismatch to conflict without becoming ready", async () => {
    vi.doMock("../src/main/runtime/hermes-runtime-locator", () => locatorMock());
    vi.doMock("../src/main/runtime/gateway-probe", () =>
      gatewayProbeMock({
        inspectGatewayListener: vi.fn(async () => ({
          status: "mismatch" as const,
          actualPath: "C:\\Windows\\System32\\python.exe",
        })),
      }),
    );
    vi.doMock("../src/main/installer", () => ({
      getHermesVersion: vi.fn(async () => "1.0.0"),
    }));
    const { LegacyLocalRuntimeAdapter } = await import(
      "../src/main/runtime/legacy-local-runtime-adapter"
    );
    const probe = await new LegacyLocalRuntimeAdapter().probe();
    expect(probe.state).toBe("conflict");
    expect(probe.errorCode).toBe("CONFLICT");
    expect(probe.runtimeContextVerified).toBe(false);
  });

  it("maps missing local listener after health to configuration_error", async () => {
    vi.doMock("../src/main/runtime/hermes-runtime-locator", () => locatorMock());
    vi.doMock("../src/main/runtime/gateway-probe", () =>
      gatewayProbeMock({
        inspectGatewayListener: vi.fn(async () => ({
          status: "no_listener" as const,
        })),
      }),
    );
    vi.doMock("../src/main/installer", () => ({
      getHermesVersion: vi.fn(async () => "1.0.0"),
    }));
    const { LegacyLocalRuntimeAdapter } = await import(
      "../src/main/runtime/legacy-local-runtime-adapter"
    );
    const probe = await new LegacyLocalRuntimeAdapter().probe();
    expect(probe.state).toBe("configuration_error");
    expect(probe.state).not.toBe("ready");
  });

  it("maps listen inspect failure to configuration_error, not ready", async () => {
    vi.doMock("../src/main/runtime/hermes-runtime-locator", () => locatorMock());
    vi.doMock("../src/main/runtime/gateway-probe", () =>
      gatewayProbeMock({
        inspectGatewayListener: vi.fn(async () => ({
          status: "inspect_failed" as const,
          reason: "access denied",
        })),
      }),
    );
    vi.doMock("../src/main/installer", () => ({
      getHermesVersion: vi.fn(async () => "1.0.0"),
    }));
    const { LegacyLocalRuntimeAdapter } = await import(
      "../src/main/runtime/legacy-local-runtime-adapter"
    );
    const probe = await new LegacyLocalRuntimeAdapter().probe();
    expect(probe.state).toBe("configuration_error");
    expect(probe.errorMessage).toContain("access denied");
  });

  it("rejects %LOCALAPPDATA%\\hermes as a managed home even when listen matches", async () => {
    const localAppData = "C:\\Users\\test\\AppData\\Local";
    const previous = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = localAppData;
    vi.doMock("../src/main/runtime/hermes-runtime-locator", () =>
      locatorMock({
        homePath: `${localAppData}\\hermes`,
      }),
    );
    vi.doMock("../src/main/runtime/gateway-probe", () => gatewayProbeMock());
    vi.doMock("../src/main/installer", () => ({
      getHermesVersion: vi.fn(async () => "1.0.0"),
    }));
    try {
      const { LegacyLocalRuntimeAdapter } = await import(
        "../src/main/runtime/legacy-local-runtime-adapter"
      );
      const probe = await new LegacyLocalRuntimeAdapter().probe();
      expect(probe.state).toBe("configuration_error");
      expect(probe.runtimeContextVerified).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.LOCALAPPDATA;
      else process.env.LOCALAPPDATA = previous;
    }
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
    const { RuntimeManager, RUNTIME_ADAPTER_ID, RUNTIME_CONTRACT_ID } =
      await import("../src/main/runtime/runtime-manager");
    const { LegacyLocalRuntimeAdapter } = await import(
      "../src/main/runtime/legacy-local-runtime-adapter"
    );
    const manager = new RuntimeManager();
    expect(manager).toBeDefined();
    expect(manager.getAdapterIdentity()).toEqual({
      adapter: RUNTIME_ADAPTER_ID,
      contract: RUNTIME_CONTRACT_ID,
    });
    expect(RUNTIME_ADAPTER_ID).toBe("legacy-local");
    expect(RUNTIME_CONTRACT_ID).toBe("managed-local-v1");
    expect(LegacyLocalRuntimeAdapter).toBeTypeOf("function");
    expect(manager).toBeInstanceOf(RuntimeManager);
  });

  it("logs hermes_runtime_probe on state change without secrets", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { RuntimeManager } = await import("../src/main/runtime/runtime-manager");
    const probe = {
      mode: "local" as const,
      state: "gateway_auth_failed" as const,
      endpoint: "http://127.0.0.1:8642",
      homePath: "C:\\ProgramData\\SMC\\Hermes",
      executablePath: "D:\\Programs\\SMC\\Hermes\\bin\\hermes.exe",
      runtimeFound: true,
      cliAvailable: true,
      gatewayRunning: true,
      gatewayHealthy: true,
      authenticated: false,
      errorCode: "GATEWAY_AUTH_FAILED",
      errorMessage: "Bearer sk-secret-key-12345 rejected",
    };
    const manager = new RuntimeManager({
      probe: vi.fn(async () => probe),
      getStatus: vi.fn(async () => probe),
      ensureReady: vi.fn(async () => ({ ok: false, state: probe.state })),
      restart: vi.fn(async () => ({ ok: false, state: probe.state })),
    });
    await manager.probe();
    const logged = infoSpy.mock.calls
      .map((call) => String(call[0]))
      .find((line) => line.includes("hermes_runtime_probe"));
    expect(logged).toBeDefined();
    expect(logged).toContain("legacy-local");
    expect(logged).not.toContain("sk-secret");
    expect(logged).not.toContain("Bearer");
    infoSpy.mockRestore();
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
