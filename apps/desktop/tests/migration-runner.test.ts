import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("electron", () => ({
  app: {
    getVersion: () => "1.0.1",
  },
}));

vi.mock("../src/main/migrations/002-runtime-layout", () => ({
  migrateRuntimeLayout: () => [],
}));

vi.mock("../src/main/migrations/003-web-operator-config", () => ({
  migrateWebOperatorConfig: () => undefined,
}));

vi.mock("../src/main/migrations/004-v53-runtime-layout", () => ({
  migrateV53RuntimeLayout: () => [],
}));

describe("migration-runner", () => {
  let tempRoot: string;
  const prevEnv = process.env.SMC_COPILOT_INSTALL_DIR;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "smc-migrate-"));
    process.env.SMC_COPILOT_INSTALL_DIR = tempRoot;
    mkdirSync(join(tempRoot, "runtime"), { recursive: true });
    vi.stubGlobal("process", { ...process, platform: "linux" });
  });

  afterEach(() => {
    if (prevEnv === undefined) {
      delete process.env.SMC_COPILOT_INSTALL_DIR;
    } else {
      process.env.SMC_COPILOT_INSTALL_DIR = prevEnv;
    }
    rmSync(tempRoot, { recursive: true, force: true });
    vi.resetModules();
  });

  it("increments schemaVersion to 5 and writes desktop-runtime-state.json", async () => {
    const { runDesktopMigrations } = await import(
      "../src/main/migrations/migration-runner"
    );
    const status = runDesktopMigrations();
    expect(status.schemaVersion).toBe(5);
    expect(status.appVersion).toBe("1.0.1");

    const statePath = join(tempRoot, "runtime", "desktop-runtime-state.json");
    expect(existsSync(statePath)).toBe(true);
    const state = JSON.parse(readFileSync(statePath, "utf-8")) as {
      schemaVersion: number;
      migrationWarnings: string[];
    };
    expect(state.schemaVersion).toBe(5);
    expect(Array.isArray(state.migrationWarnings)).toBe(true);

    const config = JSON.parse(
      readFileSync(join(tempRoot, "runtime", "desktop-runtime.json"), "utf-8"),
    ) as { productName: string; executableName: string; appId: string };
    expect(config.productName).toBe("SMC-Copilot");
    expect(config.executableName).toBe("desktop");
    expect(config.appId).toBe("com.smc.smc-ai-copilot");
  });

  it("refreshes install identity when upgrading from schema 4", async () => {
    const runtimeRoot = join(tempRoot, "runtime");
    writeFileSync(
      join(runtimeRoot, "desktop-runtime-state.json"),
      JSON.stringify({ schemaVersion: 4, appVersion: "1.0.0" }),
      "utf-8",
    );
    writeFileSync(
      join(runtimeRoot, "desktop-runtime.json"),
      JSON.stringify({
        productName: "SMC Copilot",
        executableName: "smc-ai-copilot",
        appId: "com.smc.smc-copilot",
        pipMirror: { preset: "tsinghua" },
      }),
      "utf-8",
    );

    const { runDesktopMigrations } = await import(
      "../src/main/migrations/migration-runner"
    );
    const status = runDesktopMigrations();
    expect(status.schemaVersion).toBe(5);

    const config = JSON.parse(
      readFileSync(join(runtimeRoot, "desktop-runtime.json"), "utf-8"),
    ) as {
      productName: string;
      executableName: string;
      appId: string;
      pipMirror: { preset: string };
    };
    expect(config.productName).toBe("SMC-Copilot");
    expect(config.executableName).toBe("desktop");
    expect(config.appId).toBe("com.smc.smc-ai-copilot");
    expect(config.pipMirror.preset).toBe("tsinghua");
  });

  it("does not overwrite existing agent when legacy runtime exists elsewhere", async () => {
    const newAgent = join(tempRoot, "runtime", "hermes-agent");
    mkdirSync(newAgent, { recursive: true });
    writeFileSync(join(newAgent, "pyproject.toml"), "[project]\n", "utf-8");

    const { migrateLegacyHermesRuntime } = await import(
      "../src/main/migrations/legacy-hermes-migration"
    );
    const { resolveInstallLocation } = await import(
      "../src/main/enterprise/windows/install-location-resolver"
    );
    const loc = resolveInstallLocation();
    const warnings = migrateLegacyHermesRuntime(loc);
    expect(warnings).toEqual([]);
    expect(readFileSync(join(newAgent, "pyproject.toml"), "utf-8")).toContain(
      "[project]",
    );
  });
});
