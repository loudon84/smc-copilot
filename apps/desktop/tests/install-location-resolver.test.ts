// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const { mockExecFileSync } = vi.hoisted(() => ({
  mockExecFileSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}));

function regQueryOutput(valueName: string, value: string): string {
  return `${valueName}    REG_EXPAND_SZ    ${value}`;
}

function mockRegSequence(
  entries: Array<{ key: string; value: string } | null>,
): void {
  let callIndex = 0;
  mockExecFileSync.mockImplementation(() => {
    const entry = entries[callIndex];
    callIndex += 1;
    if (!entry) {
      throw new Error("reg query failed");
    }
    return regQueryOutput("InstallLocation", entry.value);
  });
}

describe("install-location-resolver", () => {
  let tempRoot: string;
  const prevEnv = process.env.SMC_COPILOT_INSTALL_DIR;
  const prevPlatform = process.platform;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "smc-install-"));
    process.env.SMC_COPILOT_INSTALL_DIR = tempRoot;
    mockExecFileSync.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    if (prevEnv === undefined) {
      delete process.env.SMC_COPILOT_INSTALL_DIR;
    } else {
      process.env.SMC_COPILOT_INSTALL_DIR = prevEnv;
    }
    Object.defineProperty(process, "platform", { value: prevPlatform });
    rmSync(tempRoot, { recursive: true, force: true });
    vi.resetModules();
  });

  it("resolves agentDir under runtime/hermes from env var", async () => {
    mkdirSync(join(tempRoot, "runtime", "hermes"), { recursive: true });
    const { resolveInstallLocation } = await import(
      "../src/main/enterprise/windows/install-location-resolver"
    );
    const loc = resolveInstallLocation();
    expect(loc.installDir).toBe(tempRoot);
    expect(loc.runtimeRoot).toBe(join(tempRoot, "runtime"));
    expect(loc.agentDir).toBe(join(tempRoot, "runtime", "hermes"));
    expect(loc.hermesRuntimeRoot).toBe(join(tempRoot, "runtime", "hermes"));
    expect(loc.source).toBe("env-var");
  });

  it("lists legacy install directories including Programs Hermes Agent", async () => {
    const localAppData = join(tempRoot, "local-app");
    mkdirSync(localAppData, { recursive: true });
    const legacyAgent = join(localAppData, "Programs", "Hermes Agent");
    mkdirSync(legacyAgent, { recursive: true });
    writeFileSync(join(legacyAgent, "pyproject.toml"), "[project]\n", "utf-8");

    const prevLocal = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = localAppData;

    const { readLegacyInstallLocations } = await import(
      "../src/main/enterprise/windows/install-location-resolver"
    );
    const legacy = readLegacyInstallLocations();
    expect(legacy.some((l) => l.source === "legacy-programs-hermes-agent")).toBe(
      true,
    );

    process.env.LOCALAPPDATA = prevLocal;
  });

  it("prefers HKCU Software\\SMC\\copilot registry on Windows", async () => {
    delete process.env.SMC_COPILOT_INSTALL_DIR;
    Object.defineProperty(process, "platform", { value: "win32" });

    const primaryDir = join(tempRoot, "primary-install");
    mkdirSync(primaryDir, { recursive: true });

    mockRegSequence([
      { key: "HKCU\\Software\\SMC\\copilot", value: primaryDir },
    ]);

    const { resolveInstallLocation } = await import(
      "../src/main/enterprise/windows/install-location-resolver"
    );
    const loc = resolveInstallLocation();
    expect(loc.installDir).toBe(primaryDir);
    expect(loc.source).toBe("registry");
  });

  it("falls back to legacy Copilot registry when primary is missing", async () => {
    delete process.env.SMC_COPILOT_INSTALL_DIR;
    Object.defineProperty(process, "platform", { value: "win32" });

    const legacyDir = join(tempRoot, "legacy-install");
    mkdirSync(legacyDir, { recursive: true });

    mockRegSequence([
      null,
      null,
      { key: "HKCU\\Software\\SMC\\Copilot", value: legacyDir },
    ]);

    const { resolveInstallLocation } = await import(
      "../src/main/enterprise/windows/install-location-resolver"
    );
    const loc = resolveInstallLocation();
    expect(loc.installDir).toBe(legacyDir);
    expect(loc.source).toBe("legacy-registry");
  });

  it("does not treat primary registry install dir as legacy candidate", async () => {
    delete process.env.SMC_COPILOT_INSTALL_DIR;
    Object.defineProperty(process, "platform", { value: "win32" });

    const primaryDir = join(tempRoot, "only-primary");
    mkdirSync(primaryDir, { recursive: true });

    mockRegSequence([
      { key: "HKCU\\Software\\SMC\\copilot", value: primaryDir },
    ]);

    const { readLegacyInstallLocations } = await import(
      "../src/main/enterprise/windows/install-location-resolver"
    );
    const legacy = readLegacyInstallLocations();
    expect(
      legacy.some(
        (l) =>
          l.installDir.toLowerCase() === primaryDir.toLowerCase() &&
          l.source.includes("registry"),
      ),
    ).toBe(false);
  });
});
