import { describe, expect, it, beforeEach } from "vitest";
import { parseCatalogItem, resetRemoteExpertCatalogCache, mapCatalogHttpStatus } from "./catalog-client";
import ready from "../../../contracts/nodeskclaw/remote-expert-frontend-v1.0.0/vendor/catalog/golden/ready-expert.json";
import unavailable from "../../../contracts/nodeskclaw/remote-expert-frontend-v1.0.0/vendor/catalog/golden/unavailable-expert.json";

describe("remote expert catalog parser", () => {
  beforeEach(() => {
    resetRemoteExpertCatalogCache();
  });

  it("accepts ready and unavailable golden items", () => {
    expect(parseCatalogItem(ready).status).toBe("ready");
    expect(parseCatalogItem(unavailable).status).toBe("unavailable");
    expect(parseCatalogItem(ready).agent_ref).toBe("sales-expert");
  });

  it("rejects missing required fields", () => {
    expect(() => parseCatalogItem({ display_name: "x", status: "ready" })).toThrow();
  });

  it("maps 403 to catalog auth and 5xx to unavailable", () => {
    expect(() => mapCatalogHttpStatus(403)).toThrow(/catalog auth failed/);
    expect(() => mapCatalogHttpStatus(503)).toThrow(/catalog unavailable/);
  });
});
