import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  FRONTEND_BUNDLE_DIGEST,
  FRONTEND_CONTRACT_DIGEST,
  listDiscoveryMismatches,
  pinnedDiscovery,
  REMOTE_EXPERT_FRONTEND_CONTRACT_VERSION,
  sanitizeRemoteExpertDto,
  RemoteExpertError,
} from "./remote-expert";

function contractRoot(): string {
  for (const candidate of [
    join(process.cwd(), "contracts/remote-expert-frontend/v2.0.0"),
    join(process.cwd(), "../../contracts/remote-expert-frontend/v2.0.0"),
  ]) {
    if (existsSync(join(candidate, "consumer-lock.json"))) return candidate;
  }
  throw new Error("consumer-lock.json not found");
}

describe("shared remote-expert contract", () => {
  it("[A-CONTRACT-001] pins runtime constants to consumer-lock.json", () => {
    const lock = JSON.parse(
      readFileSync(join(contractRoot(), "consumer-lock.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(REMOTE_EXPERT_FRONTEND_CONTRACT_VERSION).toBe(lock.contractVersion);
    expect(FRONTEND_CONTRACT_DIGEST).toBe(lock.frontendContractDigest);
    expect(FRONTEND_CONTRACT_DIGEST).not.toBe(FRONTEND_BUNDLE_DIGEST);
  });

  it("[A-NEG-CONTRACT-001] lists only mismatched discovery fields", () => {
    const discovery = {
      ...pinnedDiscovery(),
      frontendContractDigest:
        "b0d4018c2b064224e45ff81024dabf9f21fff77dc85dffd4a8fa018f5362faa2",
    };
    expect(listDiscoveryMismatches(discovery)).toEqual([
      {
        field: "frontendContractDigest",
        expected: FRONTEND_CONTRACT_DIGEST,
        observed: discovery.frontendContractDigest,
      },
    ]);
  });

  it("[A-NEG-SEC-001] [A-NEG-OBS-001] sanitizer rejects secret and legacy execution fields", () => {
    expect(() => sanitizeRemoteExpertDto({ skillName: "x" })).toThrow(
      RemoteExpertError,
    );
    expect(() => sanitizeRemoteExpertDto({ accessToken: "tok" })).toThrow(
      RemoteExpertError,
    );
    expect(() =>
      sanitizeRemoteExpertDto({ executionCapability: "cap" }),
    ).toThrow(RemoteExpertError);
    try {
      sanitizeRemoteExpertDto({ nested: { taskId: "t1" } });
    } catch (err) {
      expect((err as RemoteExpertError).code).toBe(
        "REMOTE_EXPERT_CREDENTIAL_LEAK_GUARD",
      );
    }
    expect(sanitizeRemoteExpertDto({ agentRef: "sales-expert" })).toEqual({
      agentRef: "sales-expert",
    });
  });
});
