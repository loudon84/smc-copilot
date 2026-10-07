import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  FRONTEND_CONTRACT_DIGEST,
  CATALOG_CONTRACT_DIGEST,
  REMOTE_ACP_CONTRACT_DIGEST,
} from "../../shared/remote-expert";
import {
  ensureCompatibleContract,
  parseDiscovery,
  resetContractGate,
  getContractGateState,
} from "./remote-expert-contract-gate";

const MATCHING = {
  frontendContractVersion: "2.1.0",
  frontendContractDigest: FRONTEND_CONTRACT_DIGEST,
  catalogContractVersion: "1.1.0",
  catalogContractDigest: CATALOG_CONTRACT_DIGEST,
  remoteAcpContractVersion: "1.1.0",
  remoteAcpContractDigest: REMOTE_ACP_CONTRACT_DIGEST,
  acpProtocolVersion: 1,
  transportProfile: "nodeskclaw.remote-acp.v1",
};

describe("remote expert contract gate", () => {
  beforeEach(() => {
    resetContractGate();
  });

  it("[A-CONTRACT-001] reaches COMPATIBLE when all 8 discovery fields match", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify(MATCHING), { status: 200 }),
    ) as unknown as typeof fetch;
    const discovery = await ensureCompatibleContract({
      fetchImpl,
      baseUrl: "http://127.0.0.1:9",
    });
    expect(discovery.frontendContractDigest).toBe(FRONTEND_CONTRACT_DIGEST);
    expect(getContractGateState()).toBe("COMPATIBLE");
  });

  it("[A-NEG-CONTRACT-001] [A-SMC-2101] fails closed when one digest hex digit changes", async () => {
    const tampered = {
      ...MATCHING,
      frontendContractDigest:
        "c25a9edbf2fa5afd6f15cb1cc1f8b17d6cb63b613bf18a2212e75002c61b4aba",
    };
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify(tampered), { status: 200 }),
    ) as unknown as typeof fetch;
    await expect(
      ensureCompatibleContract({ fetchImpl, baseUrl: "http://127.0.0.1:9" }),
    ).rejects.toMatchObject({
      code: "REMOTE_EXPERT_PROVIDER_INCOMPATIBLE",
      message: expect.stringContaining("frontendContractDigest"),
      details: {
        mismatches: [
          expect.objectContaining({
            field: "frontendContractDigest",
            observed: tampered.frontendContractDigest,
          }),
        ],
      },
    });
    expect(getContractGateState()).toBe("INCOMPATIBLE");
  });

  it("maps network failure to UNRESOLVED retryable discovery error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    await expect(
      ensureCompatibleContract({ fetchImpl, baseUrl: "http://127.0.0.1:9" }),
    ).rejects.toMatchObject({
      code: "REMOTE_EXPERT_DISCOVERY_UNAVAILABLE",
      retryable: true,
    });
    expect(getContractGateState()).toBe("UNRESOLVED");
  });

  it("parses discovery objects", () => {
    expect(parseDiscovery(MATCHING).transportProfile).toBe(
      "nodeskclaw.remote-acp.v1",
    );
  });
});
