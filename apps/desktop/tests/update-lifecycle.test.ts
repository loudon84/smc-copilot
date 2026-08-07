import { describe, it, expect, vi, beforeEach } from "vitest";

const stopHealthPolling = vi.fn();
const stopGateway = vi.fn();
const stopSshTunnel = vi.fn();
const stopClaw3d = vi.fn();
const stopAllProfiles = vi.fn().mockResolvedValue([]);
const onBeforeQuit = vi.fn();
const browserStop = vi.fn();

vi.mock("../src/main/hermes", () => ({
  stopHealthPolling,
  stopGateway,
}));

vi.mock("../src/main/ssh-tunnel", () => ({
  stopSshTunnel,
}));

vi.mock("../src/main/claw3d", () => ({
  stopAll: stopClaw3d,
}));

vi.mock("../src/main/profile-runtime-manager", () => ({
  stopAllProfiles,
  onBeforeQuit,
}));

describe("update-lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prepareForAppUpdate stops gateway, profiles, and browser tool server", async () => {
    const { prepareForAppUpdate, registerBrowserToolServerStop } = await import(
      "../src/main/update/update-lifecycle"
    );
    registerBrowserToolServerStop(browserStop);
    await prepareForAppUpdate();

    expect(stopHealthPolling).toHaveBeenCalled();
    expect(stopAllProfiles).toHaveBeenCalled();
    expect(stopGateway).toHaveBeenCalled();
    expect(stopSshTunnel).toHaveBeenCalled();
    expect(stopClaw3d).toHaveBeenCalled();
    expect(browserStop).toHaveBeenCalled();
    expect(onBeforeQuit).toHaveBeenCalled();
  });
});
