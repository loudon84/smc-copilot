import { describe, expect, it } from "vitest";
import { evaluateRemoteExpertFeatureGate } from "./remote-expert-feature-gate";

const lock = { frontendContractGate: "passed" as const, productionGate: "unpassed" as const };

describe("remote expert feature gate", () => {
  it("defaults unpackaged to alpha and packaged to off", () => {
    expect(evaluateRemoteExpertFeatureGate({ packed: false, lock }).enabled).toBe(true);
    const packed = evaluateRemoteExpertFeatureGate({ packed: true, lock });
    expect(packed.enabled).toBe(false);
    expect(packed.errorCode).toBe("REMOTE_EXPERT_PRODUCTION_GATE_BLOCKED");
  });

  it("allows explicit alpha on packaged builds", () => {
    expect(
      evaluateRemoteExpertFeatureGate({ packed: true, envValue: "alpha", lock }).enabled,
    ).toBe(true);
  });

  it("honors explicit off in development", () => {
    expect(
      evaluateRemoteExpertFeatureGate({ packed: false, envValue: "off", lock }).enabled,
    ).toBe(false);
  });
});
