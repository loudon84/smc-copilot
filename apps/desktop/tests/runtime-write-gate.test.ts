import { describe, expect, it, vi, beforeEach } from "vitest";
import { createInitialRuntimeConnectionState } from "../src/shared/copilot-runtime/runtime-state-contract";
import { assertRuntimeReadyForWrite } from "../src/renderer/src/hooks/useCopilotRuntime";
import { isRuntimeReadyForWrite } from "../src/renderer/src/lib/runtime/runtimeWriteGate";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("assertRuntimeReadyForWrite", () => {
  it("allows Ready", () => {
    const state = createInitialRuntimeConnectionState({ state: "Ready", ready: true });
    expect(assertRuntimeReadyForWrite(state)).toBeNull();
    expect(isRuntimeReadyForWrite(state)).toBe(true);
  });

  it("blocks RuntimeDegraded", () => {
    const state = createInitialRuntimeConnectionState({
      state: "RuntimeDegraded",
      ready: false,
    });
    expect(assertRuntimeReadyForWrite(state)).toMatch(/RuntimeDegraded/);
    expect(isRuntimeReadyForWrite(state)).toBe(false);
  });

  it("blocks RuntimeMissing", () => {
    const state = createInitialRuntimeConnectionState({ state: "RuntimeMissing", ready: false });
    expect(assertRuntimeReadyForWrite(state)).toMatch(/RuntimeMissing/);
  });
});

describe("ensureRuntimeReadyForWrite (window.copilotRuntime)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when Runtime is degraded", async () => {
    const getState = vi.fn().mockResolvedValue(
      createInitialRuntimeConnectionState({ state: "RuntimeDegraded", ready: false }),
    );
    vi.stubGlobal("window", {
      copilotRuntime: { getState },
    });
    const { ensureRuntimeReadyForWrite } = await import(
      "../src/renderer/src/lib/runtime/runtimeWriteGate"
    );
    await expect(ensureRuntimeReadyForWrite()).rejects.toThrow(/RuntimeDegraded/);
  });

  it("resolves when Runtime is Ready", async () => {
    const getState = vi.fn().mockResolvedValue(
      createInitialRuntimeConnectionState({ state: "Ready", ready: true }),
    );
    vi.stubGlobal("window", {
      copilotRuntime: { getState },
    });
    const { ensureRuntimeReadyForWrite } = await import(
      "../src/renderer/src/lib/runtime/runtimeWriteGate"
    );
    await expect(ensureRuntimeReadyForWrite()).resolves.toBeUndefined();
  });
});

describe("prepareForAppUpdate boundary (static)", () => {
  it("does not stop gateway profiles on update", () => {
    const src = readFileSync(
      join(__dirname, "../src/main/update/update-lifecycle.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/stopAllProfiles/);
    expect(src).not.toMatch(/stopGateway/);
    expect(src).not.toMatch(/stopSshTunnel/);
  });
});

describe("RuntimeDegradedBanner present in Layout", () => {
  it("Layout mounts RuntimeDegradedBanner", () => {
    const src = readFileSync(
      join(__dirname, "../src/renderer/src/screens/Layout/Layout.tsx"),
      "utf8",
    );
    expect(src).toMatch(/RuntimeDegradedBanner/);
  });
});
