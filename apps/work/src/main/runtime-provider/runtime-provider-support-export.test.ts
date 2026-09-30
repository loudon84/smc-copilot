import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it, vi } from "vitest";

vi.mock("./runtime-provider-diagnostics", () => ({
  getRuntimeProviderDiagnostics: () => ({
    ok: true,
    snapshot: {
      schemaVersion: "1.0",
      profile: "default",
      marker: "keep-snapshot",
      secret: "member-key",
    },
  }),
}));

vi.mock("./runtime-provider-diagnostics-history", () => ({
  readDiagnosticHistory: () =>
    Array.from({ length: 8 }, (_, index) => ({
      stage: "FETCH",
      body: "x".repeat(200_000),
      index,
    })),
}));

import {
  buildSupportBundle,
  exportRuntimeProviderDiagnostics,
} from "./runtime-provider-support-export";

describe("runtime provider support export", () => {
  it("keeps the snapshot and trims history under 1 MiB", () => {
    const built = buildSupportBundle({
      product: {
        name: "smc-copilot",
        appVersion: "0.0.0",
        platform: "win32",
        arch: "x64",
        electronVersion: "",
        nodeVersion: process.versions.node,
        runtimeAdapter: null,
        runtimeContract: null,
        hermesVersion: null,
      },
      generatedAt: "2026-09-28T00:00:00.000Z",
    });
    expect(Buffer.byteLength(built.text, "utf8")).toBeLessThanOrEqual(1024 * 1024);
    expect(built.text).toContain("keep-snapshot");
    const parsed = JSON.parse(built.text) as { snapshot: { marker: string } };
    expect(parsed.snapshot.marker).toBe("keep-snapshot");
  });

  it("does not write when the chosen target already exists", async () => {
    const dir = join(tmpdir(), `runtime-bundle-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const target = join(dir, "existing.json");
    writeFileSync(target, "{\"digest\":\"H0\"}\n");
    const before = readFileSync(target);
    const result = await exportRuntimeProviderDiagnostics({
      product: {
        name: "smc-copilot",
        appVersion: "0.0.0",
        platform: "win32",
        arch: "x64",
        electronVersion: "",
        nodeVersion: process.versions.node,
        runtimeAdapter: null,
        runtimeContract: null,
        hermesVersion: null,
      },
      choosePath: async () => ({ canceled: false, filePath: target }),
    });
    expect(result).toEqual({
      ok: false,
      error: "DIAGNOSTICS_EXPORT_TARGET_EXISTS",
    });
    expect(readFileSync(target).equals(before)).toBe(true);
  });
});
