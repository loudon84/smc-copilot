import { describe, it, expect, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => "C:\\\\tmp\\\\genehub-test",
    getName: () => "SMC-Copilot",
    getVersion: () => "0.1.9",
  },
}));
import { getDeviceIdentity } from "../src/main/genehub/device-identity";

describe("device-identity", () => {
  it("returns stable fingerprint across calls", () => {
    const first = getDeviceIdentity();
    const second = getDeviceIdentity();
    expect(first.deviceFingerprint).toBe(second.deviceFingerprint);
    expect(first.deviceFingerprint.length).toBeGreaterThan(16);
    expect(["windows", "macos", "linux"]).toContain(first.osType);
  });
});
