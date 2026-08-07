// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExistsSync, mockReaddirSync, mockResolveEffectivePortalMonorepoRoot } = vi.hoisted(
  () => ({
    mockExistsSync: vi.fn<(path: string) => boolean>(),
    mockReaddirSync: vi.fn<(path: string) => string[]>(),
    mockResolveEffectivePortalMonorepoRoot: vi.fn(() => null as string | null),
  }),
);

const mockResolveInstallLocation = vi.fn(() => ({
  installDir: "C:\\Programs\\SMC-Copilot",
  runtimeRoot: "C:\\Programs\\SMC-Copilot\\runtime",
  binDir: "C:\\Programs\\SMC-Copilot\\bin",
  agentDir: "C:\\Programs\\SMC-Copilot\\runtime\\hermes",
  hermesRuntimeRoot: "C:\\Programs\\SMC-Copilot\\runtime\\hermes",
  hermesSourceRoot: "C:\\Programs\\SMC-Copilot\\runtime\\hermes\\src",
  serveRuntimeRoot: "C:\\Programs\\SMC-Copilot\\runtime\\serve",
  serveSourceRoot: "C:\\Programs\\SMC-Copilot\\runtime\\serve\\src",
  portalRuntimeRoot: "C:\\Programs\\SMC-Copilot\\runtime\\portal",
  portalSourceRoot: "C:\\Programs\\SMC-Copilot\\runtime\\portal\\src",
  source: "registry" as const,
}));

vi.mock("node:fs", () => ({
  existsSync: (path: string) => mockExistsSync(path),
  readdirSync: (path: string) => mockReaddirSync(path),
}));

vi.mock("../src/main/runtime/portal-root-resolver", () => ({
  resolveEffectivePortalMonorepoRoot: () => mockResolveEffectivePortalMonorepoRoot(),
}));

vi.mock("../src/main/enterprise/windows/install-location-resolver", () => ({
  resolveInstallLocation: () => mockResolveInstallLocation(),
}));

import {
  clearCopilotRuntimePathCache,
  resolveCopilotRuntimePaths,
  buildCopilotRuntimeEnv,
} from "../src/main/runtime/runtime-paths";

function norm(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

const installPrefix = "c:/programs/smc-copilot/runtime";

function mockStandardRuntimeLayout(): void {
  mockExistsSync.mockImplementation((p) => {
    const n = norm(p);
    return (
      n.endsWith("/runtime/hermes/src") ||
      n.endsWith("/runtime/hermes/venv/scripts/python.exe") ||
      n.endsWith("/runtime/hermes/venv/scripts/hermes.exe") ||
      n.endsWith("/runtime/hermes/venv") ||
      n.endsWith("/runtime/serve/src") ||
      n.endsWith("/runtime/portal/src/package.json")
    );
  });
  mockReaddirSync.mockImplementation((p) => {
    const n = norm(p);
    if (n.endsWith("/runtime/hermes/src") || n.endsWith("/runtime/serve/src")) {
      return ["pyproject.toml"];
    }
    return [];
  });
}

describe("resolveCopilotRuntimePaths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCopilotRuntimePathCache();
    mockResolveEffectivePortalMonorepoRoot.mockReturnValue(null);
    mockExistsSync.mockReturnValue(false);
    mockReaddirSync.mockReturnValue([]);
  });

  it("resolves standard v5.3 layout", () => {
    mockStandardRuntimeLayout();

    const paths = resolveCopilotRuntimePaths();
    expect(norm(paths.hermesSourceRoot)).toContain(`${installPrefix}/hermes/src`);
    expect(norm(paths.serveSourceRoot)).toContain(`${installPrefix}/serve/src`);
    expect(norm(paths.portalSourceRoot)).toContain(`${installPrefix}/portal/src`);
  });

  it("returns canonical paths when no legacy payloads exist", () => {
    const paths = resolveCopilotRuntimePaths();
    expect(norm(paths.hermesSourceRoot)).toContain(`${installPrefix}/hermes/src`);
    expect(norm(paths.serveSourceRoot)).toContain(`${installPrefix}/serve/src`);
  });

  it("clears cache and re-resolves", () => {
    const first = resolveCopilotRuntimePaths();
    clearCopilotRuntimePathCache();
    mockStandardRuntimeLayout();
    const second = resolveCopilotRuntimePaths();
    expect(first).not.toBe(second);
    expect(norm(second.hermesSourceRoot)).toContain(`${installPrefix}/hermes/src`);
  });

  it("preserves COPILOT_PORTAL_ROOT in buildCopilotRuntimeEnv", () => {
    const envPortalRoot = "D:/portal/monorepo";
    mockResolveEffectivePortalMonorepoRoot.mockReturnValue(null);

    const env = buildCopilotRuntimeEnv({
      COPILOT_PORTAL_ROOT: envPortalRoot,
      COPILOT_PORTAL_RUNTIME_ROOT: "D:/portal/runtime",
    });

    expect(env.COPILOT_PORTAL_ROOT).toBe(envPortalRoot);
    expect(env.COPILOT_PORTAL_RUNTIME_ROOT).toBe("D:/portal/runtime");
  });

  it("uses effective portal root when env is unset", () => {
    const effective = "C:/Programs/SMC-Copilot/runtime/portal/src";
    mockResolveEffectivePortalMonorepoRoot.mockReturnValue(effective);

    const env = buildCopilotRuntimeEnv({});
    expect(env.COPILOT_PORTAL_ROOT).toBe(effective);
  });
});
