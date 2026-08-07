import { describe, it, expect } from "vitest";
import { mcpSkillGatewayRuntimeApi } from "../src/preload/mcp-skill-gateway-runtime-api";

describe("mcpSkillGatewayRuntime preload surface", () => {
  it("exposes readStructuredLogs", () => {
    expect(typeof mcpSkillGatewayRuntimeApi.readStructuredLogs).toBe("function");
  });

  it("exposes v6.6 operations methods", () => {
    expect(typeof mcpSkillGatewayRuntimeApi.runDiagnostics).toBe("function");
    expect(typeof mcpSkillGatewayRuntimeApi.listRemoteTools).toBe("function");
    expect(typeof mcpSkillGatewayRuntimeApi.invokeRemoteTool).toBe("function");
  });

  it("exposes v7.0 hermes client methods", () => {
    expect(typeof mcpSkillGatewayRuntimeApi.getHermesClientBootstrap).toBe("function");
    expect(typeof mcpSkillGatewayRuntimeApi.listHermesClientAgents).toBe("function");
    expect(typeof mcpSkillGatewayRuntimeApi.listHermesClientTools).toBe("function");
    expect(typeof mcpSkillGatewayRuntimeApi.runHermesReadinessCheck).toBe("function");
    expect(typeof mcpSkillGatewayRuntimeApi.createHermesTaskEventsToken).toBe("function");
    expect(typeof mcpSkillGatewayRuntimeApi.getHermesTaskResult).toBe("function");
    expect(typeof mcpSkillGatewayRuntimeApi.previewHermesArtifact).toBe("function");
    expect(typeof mcpSkillGatewayRuntimeApi.getRecentHermesTasks).toBe("function");
  });
});
