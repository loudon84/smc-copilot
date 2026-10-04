import { describe, expect, it } from "vitest";
import { evaluateRemoteExpertFeatureGate } from "./remote-expert-feature-gate";
import { canonicalizeRemoteExpertProfile } from "./profile-digest";
import { REMOTE_EXPERT_SESSION_CLASSIFICATION } from "../session-metadata-store";

describe("remote expert packaging evidence", () => {
  it("keeps production default off while productionGate is unpassed", () => {
    const result = evaluateRemoteExpertFeatureGate({
      packed: true,
      lock: { frontendContractGate: "passed", productionGate: "unpassed" },
    });
    expect(result.enabled).toBe(false);
    expect(result.errorCode).toBe("REMOTE_EXPERT_PRODUCTION_GATE_BLOCKED");
  });

  it("freezes remote-expert-acp as a chat execution pair", () => {
    expect(REMOTE_EXPERT_SESSION_CLASSIFICATION).toEqual({
      sessionKind: "chat",
      executionProvider: "remote-expert-acp",
    });
    expect(
      canonicalizeRemoteExpertProfile({
        name: "Sales Expert",
        agent_ref: "sales-expert",
      }).profile_version,
    ).toBe(1);
  });
});
