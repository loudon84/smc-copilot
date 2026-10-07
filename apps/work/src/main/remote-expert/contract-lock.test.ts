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

describe("REMOTE-EXPERT-FRONTEND-CONTRACT v2.1.0 lock", () => {
  const root = resolveFrontendContractRoot();

  it("[A-CONTRACT-001] vendors the frozen provider bundle", () => {
    expect(existsSync(join(root, "SHA256SUMS"))).toBe(true);
    expect(existsSync(join(root, "manifest.json"))).toBe(true);
    expect(existsSync(join(root, "component-pins.json"))).toBe(true);
    expect(existsSync(join(root, "RELEASE.md"))).toBe(true);
    expect(existsSync(join(root, "consumer", "smc-copilot-v2.1-handoff.json"))).toBe(
      true,
    );
    expect(existsSync(join(root, "consumer", "smc-copilot-v6.3.json"))).toBe(
      true,
    );
  });

  it("pins consumer-lock.json exact fields and forbids extras", () => {
    const lock = loadConsumerLock(root);
    expect(Object.keys(lock).sort()).toEqual([...REQUIRED_LOCK_KEYS].sort());
    expect(lock.contractName).toBe("REMOTE-EXPERT-FRONTEND-CONTRACT");
    expect(lock.contractVersion).toBe("2.1.0");
    expect(lock.providerRepository).toBe("loudon84/nodeskclaw");
    expect(lock.tagName).toBe("remote-expert-frontend-contract-v2.1.0");
    expect(lock.tagTargetCommit).toBe(
      "9982d57510581cb3e1bc4b45b59eac11c99b3a52",
    );
    expect(lock.frontendContractVersion).toBe("2.1.0");
    expect(lock.frontendContractDigest).toBe(
      "b25a9edbf2fa5afd6f15cb1cc1f8b17d6cb63b613bf18a2212e75002c61b4aba",
    );
    expect(lock.catalogContractVersion).toBe("1.1.0");
    expect(lock.catalogContractDigest).toBe(
      "d51d27a33e6776be780bf3556ffa4ef4f6dab7f731c0a48421683708364efd2c",
    );
    expect(lock.remoteAcpContractVersion).toBe("1.1.0");
    expect(lock.remoteAcpContractDigest).toBe(
      "86668a0a013ca3aef08f11611c6c32cb7643918caf21f5d530049b0d0a1a28be",
    );
    expect(lock.acpProtocolVersion).toBe(1);
    expect(lock.transportProfile).toBe("nodeskclaw.remote-acp.v1");
  });

  it("computes frontendContractDigest from raw SHA256SUMS bytes", () => {
    const digest = sha256OfFile(join(root, "SHA256SUMS"));
    expect(digest).toBe(
      "b25a9edbf2fa5afd6f15cb1cc1f8b17d6cb63b613bf18a2212e75002c61b4aba",
    );
    expect(digest).not.toBe(FRONTEND_BUNDLE_DIGEST);
    expect(verifyVendoredSha256Sums(root)).toBe(digest);
    expect(verifyConsumerLock(root).frontendContractDigest).toBe(digest);
  });

  it("[A-SMC-2101] fails closed when SHA256SUMS digest is tampered by one hex digit", () => {
    const tmp = mkdtempSync(join(tmpdir(), "re-lock-"));
    const lockPath = join(tmp, "consumer-lock.json");
    const raw = readFileSync(join(root, "consumer-lock.json"), "utf8");
    writeFileSync(
      lockPath,
      raw.replace(
        "b25a9edbf2fa5afd6f15cb1cc1f8b17d6cb63b613bf18a2212e75002c61b4aba",
        "c25a9edbf2fa5afd6f15cb1cc1f8b17d6cb63b613bf18a2212e75002c61b4aba",
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
