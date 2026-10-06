import { describe, expect, it, beforeEach } from "vitest";
import {
  parseCatalogItem,
  resetRemoteExpertCatalogCache,
  mapCatalogHttpStatus,
  requireCallableExpert,
} from "./remote-expert-catalog-client";

const ready = {
  agent_ref: "sales-expert",
  display_name: "Sales Expert",
  description: "sales",
  category: "sales",
  tags: ["crm", "rfq"],
  avatar: null,
  status: "ready",
  capabilities: {
    acp: { protocol_version: 1, remote_transport: true },
    attachments: "resource_link",
    artifacts: "resource_link",
    session_resume: true,
    permissions: true,
  },
};

const unavailable = {
  ...ready,
  status: "unavailable",
  capabilities: {
    ...ready.capabilities,
    acp: { protocol_version: 1, remote_transport: false },
  },
};

describe("remote expert catalog v1.1.0 parser", () => {
  beforeEach(() => {
    resetRemoteExpertCatalogCache();
  });

  it("[A-CATALOG-001] maps snake_case golden ready expert to camelCase DTO", () => {
    const item = parseCatalogItem(ready);
    expect(item.agentRef).toBe("sales-expert");
    expect(item.capabilities.acp.protocolVersion).toBe(1);
    expect(item.capabilities.acp.remoteTransport).toBe(true);
    expect(requireCallableExpert(item).agentRef).toBe("sales-expert");
  });

  it("treats unavailable as non-callable", () => {
    const item = parseCatalogItem(unavailable);
    expect(() => requireCallableExpert(item)).toThrow(
      /not callable|UNAVAILABLE/i,
    );
  });

  it("[A-NEG-CATALOG-001] rejects missing agent_ref", () => {
    expect(() =>
      parseCatalogItem({ ...ready, agent_ref: "" }),
    ).toThrow(/REMOTE_EXPERT_CATALOG_INVALID|agent_ref/);
    try {
      parseCatalogItem({ display_name: "x", status: "ready" });
    } catch (err) {
      expect((err as { code: string }).code).toBe(
        "REMOTE_EXPERT_CATALOG_INVALID",
      );
    }
  });

  it("maps auth statuses", () => {
    expect(() => mapCatalogHttpStatus(401)).toThrow(/auth required/);
    expect(() => mapCatalogHttpStatus(403)).toThrow(/forbidden/);
    expect(() => mapCatalogHttpStatus(503)).toThrow(/unavailable/);
  });
});
