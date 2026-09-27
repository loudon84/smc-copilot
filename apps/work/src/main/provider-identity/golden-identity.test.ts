// @vitest-environment node
import { describe, expect, it } from "vitest";
import { prepareLocalChatRoute } from "./local-migrate-and-send";

const registry = [
  {
    providerKey: "company",
    baseUrl: "https://new.example/v1",
    keyEnv: "",
    apiMode: "chat_completions" as const,
  },
];

export function classifyGoldenUpstream(
  outcome: "ok" | 401 | "unreachable" | "upstream-error",
): "PASS" | "FAIL" | "BLOCKED" {
  if (outcome === 401) return "FAIL";
  if (outcome === "unreachable" || outcome === "upstream-error") return "BLOCKED";
  return "PASS";
}

describe("A-GOLDEN-001 identity gate", () => {
  it("uses one named provider for both transports and never bare custom", async () => {
    const input = {
      mode: "local" as const,
      model: "deepseek-v4-flash",
      providerRef: "named:company",
      provider: "company",
      source: "session" as const,
      registry,
      legacyRegistry: [
        {
          providerKey: "company",
          name: "Company",
          baseUrl: "https://new.example/v1",
        },
      ],
      projectionOk: true,
      gatewayLoadedProjection: true,
    };
    const gateway = await prepareLocalChatRoute(input);
    const dashboard = await prepareLocalChatRoute(input);
    expect(gateway).toEqual(dashboard);
    expect(gateway).toMatchObject({
      ok: true,
      action: "send",
      providerRef: "named:company",
      hermesProvider: "company",
      strategy: "named-config",
    });
    const bareCustom = [gateway, dashboard].filter(
      (route) =>
        route.ok &&
        route.action === "send" &&
        (route.hermesProvider === "custom" ||
          route.hermesProvider.startsWith("custom:")),
    );
    expect(bareCustom).toHaveLength(0);
  });

  it("keeps identity PASS when the upstream result is BLOCKED", () => {
    expect(classifyGoldenUpstream("unreachable")).toBe("BLOCKED");
    expect(classifyGoldenUpstream("upstream-error")).toBe("BLOCKED");
    expect(classifyGoldenUpstream(401)).toBe("FAIL");
    expect(classifyGoldenUpstream("ok")).toBe("PASS");
  });
});
