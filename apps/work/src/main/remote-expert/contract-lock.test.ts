import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  FRONTEND_BUNDLE_DIGEST,
  loadConsumerLock,
  resolveFrontendContractRoot,
  sha256OfFile,
  verifyConsumerLock,
  verifyVendoredSha256Sums,
} from "./contract-lock";

const REQUIRED_LOCK_KEYS = [
  "contractName",
  "contractVersion",
  "providerRepository",
  "tagName",
  "tagTargetCommit",
  "frontendContractVersion",
  "frontendContractDigest",
  "catalogContractVersion",
  "catalogContractDigest",
  "remoteAcpContractVersion",
  "remoteAcpContractDigest",
  "acpProtocolVersion",
  "transportProfile",
] as const;

describe("REMOTE-EXPERT-FRONTEND-CONTRACT v2.0.0 lock", () => {
  const root = resolveFrontendContractRoot();

  it("[A-CONTRACT-001] vendors the frozen provider bundle", () => {
    expect(existsSync(join(root, "SHA256SUMS"))).toBe(true);
    expect(existsSync(join(root, "manifest.json"))).toBe(true);
    expect(existsSync(join(root, "component-pins.json"))).toBe(true);
    expect(existsSync(join(root, "RELEASE.md"))).toBe(true);
    expect(existsSync(join(root, "consumer", "smc-copilot-v6.3.json"))).toBe(
      true,
    );
  });

  it("pins consumer-lock.json exact fields and forbids extras", () => {
    const lock = loadConsumerLock(root);
    expect(Object.keys(lock).sort()).toEqual([...REQUIRED_LOCK_KEYS].sort());
    expect(lock.contractName).toBe("REMOTE-EXPERT-FRONTEND-CONTRACT");
    expect(lock.contractVersion).toBe("2.0.0");
    expect(lock.providerRepository).toBe("loudon84/nodeskclaw");
    expect(lock.tagName).toBe("remote-expert-frontend-contract-v2.0.0");
    expect(lock.tagTargetCommit).toBe(
      "5d36d6f7bebe1e70e7e031eaf384e124c76d98bc",
    );
    expect(lock.frontendContractVersion).toBe("2.0.0");
    expect(lock.frontendContractDigest).toBe(
      "22ad68dd1132a073f6df5d2bf9f219b683c73ebb7ea1fa48933c9b92a744ecd5",
    );
    expect(lock.catalogContractVersion).toBe("1.1.0");
    expect(lock.catalogContractDigest).toBe(
      "d51d27a33e6776be780bf3556ffa4ef4f6dab7f731c0a48421683708364efd2c",
    );
    expect(lock.remoteAcpContractVersion).toBe("1.0.0");
    expect(lock.remoteAcpContractDigest).toBe(
      "8a48e74e363c71875739c33b2bcdcb6f6f2ea7ee15897ae9fb9b8e9407ee9d06",
    );
    expect(lock.acpProtocolVersion).toBe(1);
    expect(lock.transportProfile).toBe("nodeskclaw.remote-acp.v1");
  });

  it("computes frontendContractDigest from raw SHA256SUMS bytes", () => {
    const digest = sha256OfFile(join(root, "SHA256SUMS"));
    expect(digest).toBe(
      "22ad68dd1132a073f6df5d2bf9f219b683c73ebb7ea1fa48933c9b92a744ecd5",
    );
    expect(digest).not.toBe(FRONTEND_BUNDLE_DIGEST);
    expect(verifyVendoredSha256Sums(root)).toBe(digest);
    expect(verifyConsumerLock(root).frontendContractDigest).toBe(digest);
  });

  it("fails closed when SHA256SUMS digest is tampered by one hex digit", () => {
    const tmp = mkdtempSync(join(tmpdir(), "re-lock-"));
    const lockPath = join(tmp, "consumer-lock.json");
    const raw = readFileSync(join(root, "consumer-lock.json"), "utf8");
    writeFileSync(
      lockPath,
      raw.replace(
        "22ad68dd1132a073f6df5d2bf9f219b683c73ebb7ea1fa48933c9b92a744ecd5",
        "32ad68dd1132a073f6df5d2bf9f219b683c73ebb7ea1fa48933c9b92a744ecd5",
      ),
    );
    writeFileSync(join(tmp, "SHA256SUMS"), readFileSync(join(root, "SHA256SUMS")));
    try {
      verifyConsumerLock(tmp);
      throw new Error("expected throw");
    } catch (err) {
      expect((err as { code?: string }).code).toBe(
        "REMOTE_EXPERT_PROVIDER_INCOMPATIBLE",
      );
    }
  });
});
