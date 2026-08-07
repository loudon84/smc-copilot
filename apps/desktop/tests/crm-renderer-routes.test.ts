import { describe, expect, it } from "vitest";
import {
  CRM_RENDERER_ROUTES,
  resolveCrmRendererRoute,
} from "../src/shared/crm-bridge/crm-renderer-routes";

describe("crm-renderer-routes", () => {
  it("resolves known paths with or without leading slash", () => {
    expect(resolveCrmRendererRoute(CRM_RENDERER_ROUTES.customerAi)?.id).toBe(
      "customer-ai",
    );
    expect(resolveCrmRendererRoute("crm/quote-assistant")?.id).toBe("quote-assistant");
  });

  it("returns null for unknown paths", () => {
    expect(resolveCrmRendererRoute("/crm/unknown")).toBeNull();
    expect(resolveCrmRendererRoute("")).toBeNull();
  });
});
