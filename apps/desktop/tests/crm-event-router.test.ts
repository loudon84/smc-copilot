import { describe, expect, it, vi } from "vitest";
import { routeCrmBridgeEvent } from "../src/main/crm-bridge/crm-event-router";

vi.mock("../src/main/crm-bridge/crm-bridge-config", () => {
  return {
    getCrmBridgeConfig: () => ({
      enabled: true,
      allowedOrigins: ["https://crm.company.com"],
      payloadMaxBytes: 1000,
      trustedGestureWindowMs: 1500,
      allowedEventTypes: ["crm.context.submit"],
      routes: {
        "crm.context.submit": {
          action: "open-web-operator-panel",
          focusedPanel: "crm-context",
          refreshSnapshot: true,
        },
      },
    }),
  };
});

describe("crm event router", () => {
  it("routes crm.context.submit to open-web-operator-panel", async () => {
    const result = await routeCrmBridgeEvent({
      sender: {} as any,
      event: {
        source: "crm-web",
        sdkVersion: "0.1.0",
        requestId: "req_1",
        type: "crm.context.submit",
        trigger: { type: "user-click", timestamp: new Date().toISOString() },
        page: { app: "crm", url: "https://crm.company.com/customer/1001" },
      },
      controller: {
        capturePageSnapshot: vi.fn().mockResolvedValue({}),
      } as any,
      mainWindow: null,
    });
    expect(result.ok).toBe(true);
    expect(result.action).toBe("open-web-operator-panel");
    expect(result.focusedPanel).toBe("crm-context");
  });
});

