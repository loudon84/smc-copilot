import { describe, expect, it } from "vitest";
import { assertAdapterCompatible } from "./compatibility-gate";
import { RemoteExpertError } from "../../shared/remote-expert-acp/errors";
import type { ContractLockFile } from "./contract-lock";

const lock = {
  protocolVersion: 1,
  adapterBinaryVersion: "1.6.1",
  components: {
    acpAdapter: { version: "1.1.0", consumerDigest: "aaa" },
    remoteAgent: { consumerDigest: "bbb" },
  },
} as unknown as ContractLockFile;

describe("adapter compatibility gate", () => {
  it("rejects digest and version mismatches", () => {
    expect(() =>
      assertAdapterCompatible(
        {
          adapterVersion: "1.6.1",
          protocolVersion: 1,
          adapterContractVersion: "1.1.0",
          adapterContractDigest: "wrong",
          remoteAgentContractVersion: "1.0.0",
          remoteAgentContractDigest: "bbb",
        },
        lock,
      ),
    ).toThrow(RemoteExpertError);
  });
});
