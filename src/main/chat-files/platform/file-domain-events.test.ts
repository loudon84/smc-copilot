// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  events: [] as Array<unknown>,
  windows: [] as Array<{ isDestroyed: () => boolean; webContents: { send: ReturnType<typeof vi.fn> } }>,
}));

vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: () => mockState.windows,
  },
}));

describe("file-domain-events", () => {
  it("notifies in-process listeners and renderer windows", async () => {
    mockState.events = [];
    const send = vi.fn();
    mockState.windows = [
      { isDestroyed: () => false, webContents: { send } },
      { isDestroyed: () => true, webContents: { send: vi.fn() } },
    ];
    vi.resetModules();
    const { emitFileDomainEvent, subscribeFileDomainEvents } = await import(
      "./file-domain-events"
    );
    const received: unknown[] = [];
    const unsub = subscribeFileDomainEvents((event) => {
      received.push(event);
    });

    emitFileDomainEvent({
      type: "file:created",
      fileId: "f1",
      sessionId: "s1",
      role: "agent-output",
    });

    expect(received).toEqual([
      {
        type: "file:created",
        fileId: "f1",
        sessionId: "s1",
        role: "agent-output",
      },
    ]);
    expect(send).toHaveBeenCalledWith("files:event", {
      type: "file:created",
      fileId: "f1",
      sessionId: "s1",
      role: "agent-output",
    });
    unsub();
  });
});
