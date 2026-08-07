// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";

const { mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn<(path: string) => boolean>(),
  mockReadFileSync: vi.fn<(path: string, encoding: BufferEncoding) => string>(),
}));

const installDir = join(tmpdir(), "smc-copilot-test");
const runtimeRoot = join(installDir, "runtime");
const portalSrc = join(runtimeRoot, "portal", "src");
const legacyRoot = join(runtimeRoot, "ai-os-full");

vi.mock("node:fs", () => ({
  existsSync: (path: string) => mockExistsSync(path),
  readFileSync: (path: string, encoding: BufferEncoding) => mockReadFileSync(path, encoding),
}));

vi.mock("../src/main/enterprise/windows/install-location-resolver", () => ({
  resolveInstallLocation: () => ({
    installDir,
    runtimeRoot,
    binDir: join(installDir, "bin"),
    agentDir: join(runtimeRoot, "hermes"),
    hermesRuntimeRoot: join(runtimeRoot, "hermes"),
    hermesSourceRoot: join(runtimeRoot, "hermes", "src"),
    serveRuntimeRoot: join(runtimeRoot, "serve"),
    serveSourceRoot: join(runtimeRoot, "serve", "src"),
    portalRuntimeRoot: join(runtimeRoot, "portal"),
    portalSourceRoot: portalSrc,
    source: "registry" as const,
  }),
}));

import {
  isPortalMonorepoRoot,
  resolveEffectivePortalMonorepoRoot,
  readConfigPortalSourceRoot,
} from "../src/main/runtime/portal-root-resolver";

function norm(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

function markMonorepo(root: string): void {
  const n = norm(root).replace(/\/$/, "");
  mockExistsSync.mockImplementation((p) => {
    const path = norm(p);
    return (
      path.endsWith(`${n}/package.json`) ||
      path.endsWith(`${n}/backend`) ||
      path.endsWith(`${n}/frontend`) ||
      path.endsWith("/desktop-runtime.json")
    );
  });
}

describe("portal-root-resolver", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.COPILOT_PORTAL_ROOT;
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue("{}");
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("detects monorepo layout", () => {
    markMonorepo(portalSrc);
    expect(isPortalMonorepoRoot(portalSrc)).toBe(true);
  });

  it("prefers COPILOT_PORTAL_ROOT over filesystem", () => {
    markMonorepo(legacyRoot);
    process.env.COPILOT_PORTAL_ROOT = legacyRoot;

    const resolved = resolveEffectivePortalMonorepoRoot();
    expect(resolved).toBe(legacyRoot);
  });

  it("falls back to desktop-runtime.json portalSourceRoot", () => {
    markMonorepo(portalSrc);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ portalSourceRoot: portalSrc }),
    );

    const resolved = resolveEffectivePortalMonorepoRoot();
    expect(resolved).toBe(portalSrc);
  });

  it("returns null when no valid monorepo exists", () => {
    expect(resolveEffectivePortalMonorepoRoot()).toBeNull();
  });

  it("readConfigPortalSourceRoot returns trimmed portalSourceRoot", () => {
    mockExistsSync.mockImplementation((p) => norm(p).endsWith("/desktop-runtime.json"));
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ portalSourceRoot: `  ${portalSrc}  ` }),
    );
    expect(readConfigPortalSourceRoot()).toBe(portalSrc);
  });
});
