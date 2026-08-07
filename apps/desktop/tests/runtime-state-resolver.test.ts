import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("electron", () => ({
  app: { getVersion: () => "0.1.6" },
}));

describe("runtime-state-resolver", () => {
  let tempRoot: string;
  const prevEnv = process.env.SMC_COPILOT_INSTALL_DIR;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "smc-runtime-state-"));
    process.env.SMC_COPILOT_INSTALL_DIR = tempRoot;
    vi.resetModules();
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

  it("reports needsAgentInstall when agent source is missing", async () => {
    mkdirSync(join(tempRoot, "runtime"), { recursive: true });
    const { resolveRuntimeState } = await import(
      "../src/main/enterprise/runtime-state-resolver"
    );
    const state = resolveRuntimeState();
    expect(state.agentSourceExists).toBe(false);
    expect(state.runtimeReady).toBe(false);
    expect(state.needsAgentInstall).toBe(true);
  });

  it("reports runtimeReady when agent, venv, and cli exist", async () => {
    const agentDir = join(tempRoot, "runtime", "hermes-agent");
    const venvScripts = join(agentDir, "venv", "Scripts");
    mkdirSync(venvScripts, { recursive: true });
    writeFileSync(join(agentDir, "pyproject.toml"), "[project]\n", "utf-8");
    writeFileSync(join(venvScripts, "hermes.exe"), "", "utf-8");
    writeFileSync(join(venvScripts, "python.exe"), "", "utf-8");

    const { resolveRuntimeState } = await import(
      "../src/main/enterprise/runtime-state-resolver"
    );
    const state = resolveRuntimeState();
    expect(state.agentSourceExists).toBe(true);
    expect(state.venvExists).toBe(true);
    expect(state.hermesCliExists).toBe(true);
    expect(state.runtimeReady).toBe(true);
    expect(state.needsAgentInstall).toBe(false);
  });

  it("detects updateMode when desktop-runtime.json exists with install marker", async () => {
    const runtimeRoot = join(tempRoot, "runtime");
    mkdirSync(runtimeRoot, { recursive: true });
    writeFileSync(
      join(runtimeRoot, "desktop-runtime.json"),
      JSON.stringify({ installDir: tempRoot }),
      "utf-8",
    );
    writeFileSync(
      join(runtimeRoot, "install-marker.json"),
      JSON.stringify({ schemaVersion: "1.2.1" }),
      "utf-8",
    );

    const { resolveRuntimeState } = await import(
      "../src/main/enterprise/runtime-state-resolver"
    );
    const state = resolveRuntimeState();
    expect(state.updateMode).toBe(true);
  });
});
