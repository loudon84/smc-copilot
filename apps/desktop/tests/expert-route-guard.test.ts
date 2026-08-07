import { describe, it, expect } from "vitest";
import { assertNoRouteOverride, FORBIDDEN_ROUTE_KEYS } from "../src/main/hermes-experts/expert-route-guard";
import { HermesExpertsError } from "../src/shared/hermes-experts/hermes-experts-errors";

describe("assertNoRouteOverride", () => {
  it("allows clean arguments", () => {
    expect(() =>
      assertNoRouteOverride({
        prompt: "hi",
        context: { source: "copilot-desktop", conversationId: "c1" },
      }),
    ).not.toThrow();
  });

  it.each([
    "_routing",
    "_execution",
    "route_config",
    "profile",
    "agent_alias",
    "agentAlias",
    "runtime",
    "runtime_name",
    "runtimeName",
    "api_server_url",
    "apiServerUrl",
    "workspace_override",
    "workspaceOverride",
  ])("rejects forbidden root key %s", (key) => {
    expect(FORBIDDEN_ROUTE_KEYS.has(key)).toBe(true);
    expect(() => assertNoRouteOverride({ prompt: "hi", [key]: "bad" })).toThrow(HermesExpertsError);
    try {
      assertNoRouteOverride({ prompt: "hi", [key]: "bad" });
    } catch (err) {
      expect(err).toBeInstanceOf(HermesExpertsError);
      expect((err as HermesExpertsError).code).toBe("EXPERT_ROUTE_OVERRIDE_FORBIDDEN");
    }
  });

  it("rejects forbidden keys in context", () => {
    expect(() =>
      assertNoRouteOverride({
        prompt: "hi",
        context: { profile: "coding" },
      }),
    ).toThrow(HermesExpertsError);
  });
});
