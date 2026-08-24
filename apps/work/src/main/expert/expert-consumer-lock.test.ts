import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { WORK_EXPERT_CONTRACT_VERSION } from "../../shared/expert";

const LOCK_DIR = join(process.cwd(), "../../contracts/work-expert/v1.0.2");

describe("WORK-EXPERT-CONTRACT consumer lock", () => {
  // @lat: [[expert-execution-tests#Consumer lock version pin]]
  it("pins version 1.0.2 against consumer-lock.json and checksum artifacts", () => {
    const lock = JSON.parse(
      readFileSync(join(LOCK_DIR, "consumer-lock.json"), "utf8"),
    ) as {
      contractVersion: string;
      tagName: string;
      tagTargetCommit: string;
      providerSha256sumsPath: string;
      sha256sumsPath: string;
    };
    const sums = readFileSync(join(LOCK_DIR, "SHA256SUMS"), "utf8");

    expect(WORK_EXPERT_CONTRACT_VERSION).toBe("1.0.2");
    expect(lock.contractVersion).toBe("1.0.2");
    expect(lock.tagName).toBe("work-expert-contract-v1.0.2");
    expect(lock.tagTargetCommit).toBe(
      "ed408c354539eab3f4cabb119fbbc3df4b95efad",
    );
    expect(lock.providerSha256sumsPath).toBe(
      "nodeskclaw-backend/contracts/work-expert/v1.0.2/SHA256SUMS",
    );
    expect(lock.sha256sumsPath).toBe("SHA256SUMS");
    expect(sums).toContain("mcp/catalog-tool-annotations.schema.json");
    expect(sums).toContain("mcp/skill-tool-annotations.schema.json");
    expect(sums).toContain("openapi.yaml");
  });
});
