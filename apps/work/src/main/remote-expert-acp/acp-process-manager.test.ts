import { describe, expect, it, vi, beforeEach } from "vitest";

const { child, spawn } = vi.hoisted(() => {
  const child = {
    pid: 4242,
    stdout: { setEncoding: vi.fn(), on: vi.fn() },
    stderr: { setEncoding: vi.fn(), on: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
  };
  const spawn = vi.fn(() => child);
  return { child, spawn };
});

vi.mock("child_process", () => ({
  spawn,
  default: { spawn },
}));

vi.mock("../process-options", () => ({
  hiddenSubprocessOptions: (opts: unknown) => opts,
}));

describe("acp process manager", () => {
  beforeEach(() => {
    child.kill.mockClear();
  });

  it("kills live children on disposeAll", async () => {
    const { ensureAcpProcess, disposeAllAcpProcesses, listLiveAcpPids } = await import(
      "./acp-process-manager"
    );
    await ensureAcpProcess({
      sessionKey: "sess-a",
      exePath: "nodeskclaw-acp.exe",
      profilePath: "C:/tmp/profile.json",
      env: {},
    });
    expect(listLiveAcpPids()).toContain(4242);
    disposeAllAcpProcesses();
    expect(child.kill).toHaveBeenCalled();
  });
});
