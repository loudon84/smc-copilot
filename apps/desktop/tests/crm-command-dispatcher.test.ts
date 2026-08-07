import { describe, expect, it, vi } from "vitest";
import { dispatchCrmCommand } from "../src/main/crm-bridge/crm-command-dispatcher";

describe("crm command dispatcher", () => {
  it("sends command to webContents when ready without waiting ack", async () => {
    const send = vi.fn();
    const viewManager = {
      getExternalWebContents: () => ({ isDestroyed: () => false, send } as any),
    } as any;

    const result = await dispatchCrmCommand(
      {
        commandId: "cmd_1",
        type: "desktop.crm.showToast",
        payload: { message: "hi" },
        createdAt: new Date().toISOString(),
      },
      viewManager,
    );

    expect(result.ok).toBe(true);
    expect(result.action).toBe("crm.command.sent");
    expect(send).toHaveBeenCalled();
  });

  it("waits for ack on pushJson by default", async () => {
    const send = vi.fn();
    const viewManager = {
      getExternalWebContents: () => ({ isDestroyed: () => false, send } as any),
    } as any;

    const pending = dispatchCrmCommand(
      {
        commandId: "cmd_push",
        type: "desktop.crm.pushJson",
        payload: { handoffId: "h1", schema: "lead.ai_analysis", data: { a: 1 } },
        createdAt: new Date().toISOString(),
      },
      viewManager,
    );

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(send).toHaveBeenCalled();

    const { resolveCrmCommandResult } = await import(
      "../src/main/crm-bridge/crm-command-result-store"
    );
    resolveCrmCommandResult({
      commandId: "cmd_push",
      ok: true,
      type: "desktop.crm.pushJson",
      receivedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    const result = await pending;
    expect(result.ok).toBe(true);
    expect(result.requestId).toBe("cmd_push");
  });
});
