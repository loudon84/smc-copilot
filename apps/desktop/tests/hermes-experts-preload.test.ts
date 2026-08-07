import { describe, it, expect } from "vitest";
import { hermesExpertsApi } from "../src/preload/hermes-experts-api";

describe("hermesExperts preload surface", () => {
  it("exposes catalog methods", () => {
    expect(typeof hermesExpertsApi.listExpertCatalog).toBe("function");
    expect(typeof hermesExpertsApi.getExpert).toBe("function");
    expect(typeof hermesExpertsApi.listExpertTeams).toBe("function");
    expect(typeof hermesExpertsApi.getExpertTeam).toBe("function");
  });

  it("exposes install and summon methods", () => {
    expect(typeof hermesExpertsApi.previewInstallExpert).toBe("function");
    expect(typeof hermesExpertsApi.installExpert).toBe("function");
    expect(typeof hermesExpertsApi.previewInstallTeam).toBe("function");
    expect(typeof hermesExpertsApi.installTeam).toBe("function");
    expect(typeof hermesExpertsApi.summonExpert).toBe("function");
    expect(typeof hermesExpertsApi.summonTeam).toBe("function");
  });

  it("exposes run lifecycle, trust, preflight and desktop sync", () => {
    expect(typeof hermesExpertsApi.listExpertRuns).toBe("function");
    expect(typeof hermesExpertsApi.getExpertRun).toBe("function");
    expect(typeof hermesExpertsApi.cancelExpertRun).toBe("function");
    expect(typeof hermesExpertsApi.retryExpertRun).toBe("function");
    expect(typeof hermesExpertsApi.setExpertTrust).toBe("function");
    expect(typeof hermesExpertsApi.preflightExpert).toBe("function");
    expect(typeof hermesExpertsApi.dispatchTeam).toBe("function");
    expect(typeof hermesExpertsApi.getDesktopSyncStatus).toBe("function");
    expect(typeof hermesExpertsApi.registerDesktop).toBe("function");
    expect(typeof hermesExpertsApi.onExpertRuntimeEvent).toBe("function");
  });

  it("exposes expert gateway and skill methods", () => {
    expect(typeof hermesExpertsApi.getExpertGatewayHealth).toBe("function");
    expect(typeof hermesExpertsApi.listCatalogSkills).toBe("function");
    expect(typeof hermesExpertsApi.listExpertSkills).toBe("function");
    expect(typeof hermesExpertsApi.callCatalogSkill).toBe("function");
    expect(typeof hermesExpertsApi.listLocalArtifacts).toBe("function");
  });

  it("exposes remote run sync and artifact methods", () => {
    expect(typeof hermesExpertsApi.syncRemoteRun).toBe("function");
    expect(typeof hermesExpertsApi.getRunResult).toBe("function");
    expect(typeof hermesExpertsApi.getRunTimeline).toBe("function");
    expect(typeof hermesExpertsApi.listRunArtifacts).toBe("function");
    expect(typeof hermesExpertsApi.previewRunArtifact).toBe("function");
    expect(typeof hermesExpertsApi.downloadRunArtifact).toBe("function");
    expect(typeof hermesExpertsApi.importRunArtifact).toBe("function");
  });

  it("exposes genehub push and submission methods", () => {
    expect(typeof hermesExpertsApi.pushGeneHubSkill).toBe("function");
    expect(typeof hermesExpertsApi.listGeneHubSubmissions).toBe("function");
    expect(typeof hermesExpertsApi.listGeneHubPullJobs).toBe("function");
  });
});
