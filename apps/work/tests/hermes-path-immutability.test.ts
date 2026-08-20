/**
 * FR-215-09 / FR-215-24: Work resolves absolute Hermes CLI and process-local PATH
 * without requiring Machine PATH / `where hermes`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { delimiter, join } from "path";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";

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
}));

describe("hermes PATH immutability (Work)", () => {
  const base = join(tmpdir(), `hermes-path-imm-${Date.now()}`);
  const userData = join(base, "userdata");
  const programRoot = join(base, "Program", "Hermes");
  const hermesHome = join(base, "Data", "Hermes");
  const cliPath = join(programRoot, "bin", "hermes.exe");
  let savedPath: string | undefined;

  beforeEach(() => {
    savedPath = process.env.PATH;
    mkdirSync(join(programRoot, "bin"), { recursive: true });
    mkdirSync(join(programRoot, "scripts"), { recursive: true });
    mkdirSync(join(programRoot, "node"), { recursive: true });
    mkdirSync(hermesHome, { recursive: true });
    mkdirSync(userData, { recursive: true });
    writeFileSync(cliPath, "MZ");
    writeFileSync(join(hermesHome, "config.yaml"), "model:\n  provider: test\n");
    writeFileSync(
      join(userData, "runtime.json"),
      JSON.stringify({
        schemaVersion: 1,
        hermes: {
          home: hermesHome,
          programRoot,
          cliPath,
          scriptsRoot: join(programRoot, "scripts"),
        },
        gateway: {
          baseUrl: "http://127.0.0.1:8642",
          healthPath: "/health",
        },
      }),
      "utf-8",
    );
    process.env.HERMES_DESKTOP_USER_DATA_DIR = userData;
    // Machine PATH has no Hermes entries — only unrelated system-like tokens.
    process.env.PATH = ["C:\\Windows\\System32", "C:\\Windows"].join(delimiter);
    vi.resetModules();
  });

  afterEach(() => {
    if (savedPath === undefined) delete process.env.PATH;
    else process.env.PATH = savedPath;
    delete process.env.HERMES_DESKTOP_USER_DATA_DIR;
    rmSync(base, { recursive: true, force: true });
    vi.resetModules();
  });

  it("resolves absolute CLI without where hermes / PATH search", async () => {
    const {
      invalidateHermesRuntimeConfigCache,
      getHermesCliPath,
    } = await import("../src/main/runtime/hermes-runtime-config");
    invalidateHermesRuntimeConfigCache();
    const { cliPathExists } = await import("../src/main/runtime/hermes-cli-runner");
    const cli = getHermesCliPath();
    expect(cli).toBe(cliPath);
    expect(cliPathExists()).toBe(true);
    expect(process.env.PATH || "").not.toMatch(/Hermes/i);
  });

  it("buildHermesCliEnv prefixes bin/scripts/node and keeps inherited PATH", async () => {
    const { invalidateHermesRuntimeConfigCache } = await import(
      "../src/main/runtime/hermes-runtime-config"
    );
    invalidateHermesRuntimeConfigCache();
    const { buildHermesCliEnv } = await import(
      "../src/main/runtime/hermes-cli-runner"
    );
    const env = buildHermesCliEnv();
    const parts = (env.PATH || "").split(delimiter);
    expect(parts[0]).toBe(join(programRoot, "bin"));
    expect(parts[1]).toBe(join(programRoot, "scripts"));
    expect(parts[2]).toBe(join(programRoot, "node"));
    expect(parts.slice(3).join(delimiter)).toBe(
      ["C:\\Windows\\System32", "C:\\Windows"].join(delimiter),
    );
    expect(process.env.PATH).toBe(
      ["C:\\Windows\\System32", "C:\\Windows"].join(delimiter),
    );
  });
});
