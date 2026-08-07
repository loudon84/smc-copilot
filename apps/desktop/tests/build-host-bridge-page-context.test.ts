import { describe, expect, it } from "vitest";
import type { HostBridgeStoredEvent } from "../src/shared/crm-bridge";
import {
  buildPageContextFromHostBridgeEvent,
  resolveHostBridgePageUrl,
} from "../src/renderer/src/screens/WebOperator/context/build-page-context";

function sampleEvent(): HostBridgeStoredEvent {
  return {
    source: "host-web",
    protocolVersion: "6.0",
    sdkVersion: "1.0.0",
    requestId: "req-host-001",
    type: "host.bridge.submit",
    formType: "product",
    action: "analytic",
    trigger: { type: "user-click", timestamp: "2026-06-02T00:00:00.000Z" },
    pageContext: {
      app: "crm-lite",
      url: "http://localhost:5178/products/1001",
      title: "商品详情",
      entityType: "product",
      entityId: "1001",
      safeText: "SKU: PHONE-001",
      fields: { sku: "PHONE-001" },
    },
    createdAt: "2026-06-02T00:00:01.000Z",
  };
}

describe("buildPageContextFromHostBridgeEvent", () => {
  it("resolves pageUrl from pageContext.url", () => {
    const event = sampleEvent();
    expect(resolveHostBridgePageUrl(event)).toBe("http://localhost:5178/products/1001");
  });

  it("falls back to callbackUrl when pageContext.url is empty", () => {
    const event = sampleEvent();
    event.pageContext.url = "";
    event.callbackUrl = "http://localhost:3000/product-form.html";
    expect(resolveHostBridgePageUrl(event)).toBe("http://localhost:3000/product-form.html");
  });

  it("maps host bridge event to HermesPanelPageContext", () => {
    const event = sampleEvent();
    const ctx = buildPageContextFromHostBridgeEvent(event);

    expect(ctx.type).toBe("web-operator");
    expect(ctx.scopeKey).toContain("host-bridge:req-host-001");
    expect(ctx.summary).toContain("product");
    expect(ctx.summary).toContain("analytic");
    expect(ctx.payload.url).toBe("http://localhost:5178/products/1001");
    expect(ctx.payload.frameId).toBeNull();
    expect(ctx.payload.textExcerpt).toBe("SKU: PHONE-001");
    expect(ctx.payload.htmlExcerpt).toContain("req-host-001");
    expect(ctx.payload.htmlExcerpt).toContain("crm-lite");
    expect(ctx.payload.capturedAt).toBe("2026-06-02T00:00:01.000Z");
  });
});
