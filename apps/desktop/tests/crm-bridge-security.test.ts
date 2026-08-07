import { describe, expect, it, vi } from "vitest";
import { validateCrmBridgeEvent } from "../src/main/crm-bridge/crm-bridge-security";

vi.mock("../src/main/crm-bridge/crm-bridge-config", async () => {
  const actual = await vi.importActual<typeof import("../src/main/crm-bridge/crm-bridge-config")>(
    "../src/main/crm-bridge/crm-bridge-config",
  );
  return {
    ...actual,
    getCrmBridgeConfig: () => ({
      enabled: true,
      allowedOrigins: ["https://crm.company.com"],
      payloadMaxBytes: 1000,
      trustedGestureWindowMs: 1500,
      allowedEventTypes: ["crm.context.submit"],
      routes: {
        "crm.context.submit": { action: "open-web-operator-panel", focusedPanel: "page-structure" },
      },
    }),
  };
});

function makeViewManager(senderId: number) {
  return {
    getExternalWebContents: () =>
      ({ id: senderId, isDestroyed: () => false } as unknown as Electron.WebContents),
  } as any;
}

describe("crm bridge security", () => {
  it("rejects when sender is not web-operator webContents", () => {
    const result = validateCrmBridgeEvent({
      sender: { id: 2 } as any,
      frame: null,
      input: { event: {} },
      viewManager: makeViewManager(1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("ORIGIN_NOT_ALLOWED");
    }
  });

  it("rejects when origin not allowed", () => {
    const result = validateCrmBridgeEvent({
      sender: { id: 1 } as any,
      frame: { url: "https://evil.example.com/a" } as any,
      input: {
        event: {
          source: "crm-web",
          sdkVersion: "0.1.0",
          requestId: "req_1",
          type: "crm.context.submit",
          trigger: { type: "user-click", timestamp: new Date().toISOString() },
          page: { app: "crm", url: "https://crm.company.com/customer/1001" },
        },
        location: { origin: "https://evil.example.com", href: "", title: "" },
      },
      viewManager: makeViewManager(1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("ORIGIN_NOT_ALLOWED");
    }
  });
});

