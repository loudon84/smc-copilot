import { describe, expect, it } from "vitest";
import {
  CLAIM_WINDOW_MS,
  PRERUN_LIVE_IDS,
  computeGateTimestamps,
  isClaimWindowOpen,
} from "../../scripts/lib/remote-expert-g7-evidence.mjs";
import { evaluateG7Prerequisites } from "../../scripts/lib/remote-expert-g7-prereq.mjs";

describe("remote-expert-g7-evidence [A-PG-2107]", () => {
  it("PASS overall sets productionGate=passed with 14d window", () => {
    const now = new Date("2026-10-07T15:00:00.000Z");
    const gate = computeGateTimestamps("PASS", now);
    expect(gate.productionGate).toBe("passed");
    expect(gate.claimAuthorized).toBe(false);
    expect(gate.passedAt).toBe("2026-10-07T15:00:00.000Z");
    expect(Date.parse(gate.expiresAt!) - now.getTime()).toBe(CLAIM_WINDOW_MS);
  });

  it("FAIL overall keeps productionGate=unpassed", () => {
    const gate = computeGateTimestamps("FAIL");
    expect(gate).toEqual({
      productionGate: "unpassed",
      claimAuthorized: false,
      passedAt: null,
      expiresAt: null,
    });
  });

  it("isClaimWindowOpen rejects expired evidence", () => {
    const passedAt = "2026-10-01T00:00:00.000Z";
    const expiresAt = new Date(
      Date.parse(passedAt) + CLAIM_WINDOW_MS,
    ).toISOString();
    const evidence = {
      overall: "PASS",
      productionGate: "passed",
      expiresAt,
    };
    expect(
      isClaimWindowOpen(evidence, new Date("2026-10-20T00:00:00.000Z")),
    ).toBe(false);
    expect(
      isClaimWindowOpen(evidence, new Date("2026-10-10T00:00:00.000Z")),
    ).toBe(true);
  });

  it("prerun live ids are exactly LIVE-001..003 [A-PG-2100]", () => {
    expect(PRERUN_LIVE_IDS).toEqual([
      "A-G7-LIVE-001",
      "A-G7-LIVE-002",
      "A-G7-LIVE-003",
    ]);
  });
});

describe("evaluateG7Prerequisites topology env", () => {
  it("surfaces optional envId/k8s fields without requiring them", () => {
    const r = evaluateG7Prerequisites({
      dirty: false,
      env: {
        SMC_REMOTE_EXPERT_G7: "1",
        SMC_REMOTE_EXPERT_G7_BACKEND_URL: "http://example.com",
        SMC_REMOTE_EXPERT_G7_TOKEN: "tok",
        SMC_REMOTE_EXPERT_G7_ORG_ID: "org",
        SMC_REMOTE_EXPERT_G7_USER_ID: "user",
        SMC_REMOTE_EXPERT_G7_AGENT_REF: "marketing",
        SMC_REMOTE_EXPERT_G7_DESIGNATED_TEST_EXPERT: "marketing",
        SMC_REMOTE_EXPERT_G7_ENV_ID: "nodeskclaw-prod",
        SMC_REMOTE_EXPERT_G7_K8S_CONTEXT: "nodesk-infra-vke-dev-dmz-01",
        SMC_REMOTE_EXPERT_G7_K8S_NAMESPACE: "nodeskclaw-system",
      },
    });
    expect(r.ready).toBe(true);
    expect(r.envId).toBe("nodeskclaw-prod");
    expect(r.k8sContext).toBe("nodesk-infra-vke-dev-dmz-01");
    expect(r.k8sNamespace).toBe("nodeskclaw-system");
  });
});
