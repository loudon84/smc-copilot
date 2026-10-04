import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  bundleDigestFromChecksumText,
  loadContractLock,
  resolveContractRoot,
  verifyComponentChecksums,
  verifyPinnedContract,
} from "./contract-lock";
import { RemoteExpertError } from "../../shared/remote-expert-acp/errors";
import { cpSync } from "fs";

describe("remote expert contract lock", () => {
  const root = resolveContractRoot();

  it("pins the frozen Provider tuple", () => {
    const lock = loadContractLock(root);
    expect(lock.tag).toBe("remote-expert-frontend-contract-v1.0.0");
    expect(lock.tagObjectSha).toBe("9f694a3b61e1b86366d23581951f2560a07946fc");
    expect(lock.targetCommit).toBe("e08428af6b814d276ed92274a64db3a46a44091f");
    expect(lock.implementationCommit).toBe(
      "896450ad479033afc2428852a2d02f70f77ab19e",
    );
    expect(lock.bundleDigest).toBe(
      "598ae09bb681049b42dbca509ff32394aaed81b1b826fab243de78cd3ff090cd",
    );
    expect(lock.components.remoteExpertCatalog.consumerDigest).toBe(
      "e5bd3f364e40ec05abb3dcb6724b11c34162175f407adbe073cf4ff0932f4d6f",
    );
    expect(lock.components.acpAdapter.consumerDigest).toBe(
      "29acb865bf90f0a3a9b51d50d93e195f76bac401e4d33217d45a738e281b2397",
    );
    expect(lock.components.remoteAgent.consumerDigest).toBe(
      "c8bc0ed8a1cf5b21fcbfb743a59a2d24480ff4dc90a651e8a0b5c057ca27b18c",
    );
    expect(lock.frontendContractGate).toBe("passed");
    expect(lock.productionGate).toBe("unpassed");
  });

  it("verifies vendored component checksums and bundleDigest", () => {
    const pin = verifyPinnedContract(root);
    expect(pin.lock.protocolVersion).toBe(1);
    expect(
      verifyComponentChecksums(join(root, pin.lock.vendorRoots.catalog)),
    ).toBe(pin.lock.components.remoteExpertCatalog.consumerDigest);
    const sums = readFileSync(
      join(root, pin.lock.vendorRoots.frontend, "SHA256SUMS"),
      "utf8",
    );
    expect(bundleDigestFromChecksumText(sums)).toBe(pin.lock.bundleDigest);
  });

  it("fails closed on digest tamper", () => {
    const tmp = mkdtempSync(join(tmpdir(), "acp-lock-"));
    cpSync(root, tmp, { recursive: true });
    const sums = join(tmp, "vendor/frontend/SHA256SUMS");
    copyFileSync(join(root, "vendor/frontend/SHA256SUMS"), sums);
    writeFileSync(sums, readFileSync(sums, "utf8").replace(/^[0-9a-f]{8}/m, "ffffffff"));
    expect(() => verifyPinnedContract(tmp)).toThrow(RemoteExpertError);
    try {
      verifyPinnedContract(tmp);
    } catch (err) {
      expect((err as RemoteExpertError).code).toBe("ACP_CONTRACT_INCOMPATIBLE");
    }
  });

  it("fails closed when lock is missing", () => {
    const tmp = mkdtempSync(join(tmpdir(), "acp-missing-"));
    expect(() => verifyPinnedContract(tmp)).toThrow(/ACP_CONTRACT_LOCK_MISSING|missing/);
    try {
      verifyPinnedContract(tmp);
    } catch (err) {
      expect((err as RemoteExpertError).code).toBe("ACP_CONTRACT_LOCK_MISSING");
    }
  });
});
