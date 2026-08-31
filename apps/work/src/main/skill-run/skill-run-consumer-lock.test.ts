import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  WORK_SKILL_RUN_CONTRACT_NAME,
  WORK_SKILL_RUN_CONTRACT_VERSION,
} from "../../shared/skill-run";
import { hasSkillRunConsumerLock } from "./skill-run-consumer-lock";

const LOCK_DIR = join(process.cwd(), "../../contracts/skill-run/v1.0.0");

describe("SKILL-RUN-CONTRACT consumer lock", () => {
  it("pins version 1.0.0 against consumer-lock.json and LF checksum artifacts", () => {
    const lock = JSON.parse(
      readFileSync(join(LOCK_DIR, "consumer-lock.json"), "utf8"),
    ) as {
      contractName: string;
      contractVersion: string;
      tagName: string;
      tagTargetCommit: string;
      providerSha256sumsPath: string;
      sha256sumsPath: string;
    };
    const sumsBytes = readFileSync(join(LOCK_DIR, "SHA256SUMS"));
    const sums = sumsBytes.toString("utf8");

    expect(WORK_SKILL_RUN_CONTRACT_NAME).toBe("WORK-SKILL-RUN-CONTRACT");
    expect(WORK_SKILL_RUN_CONTRACT_VERSION).toBe("1.0.0");
    expect(lock.contractName).toBe("SKILL-RUN-CONTRACT");
    expect(lock.contractVersion).toBe("1.0.0");
    expect(lock.tagName).toBe("skill-run-contract-v1.0.0");
    expect(lock.tagTargetCommit).toBe(
      "3e345519bcfa606553893234b59fb607ee57ac8a",
    );
    expect(lock.providerSha256sumsPath).toBe(
      "nodeskclaw-backend/contracts/skill-run/v1.0.0/SHA256SUMS",
    );
    expect(lock.sha256sumsPath).toBe("SHA256SUMS");
    expect(sumsBytes.includes(0x0d)).toBe(false);
    expect(sums).toContain("mcp/tools-list.response.schema.json");
    expect(sums).toContain("mcp/tools-call.response.schema.json");
    expect(sums).toContain("runs/public-run.schema.json");
    expect(sums).toContain("runs/result.schema.json");
    expect(sums).toContain("runs/artifact-list.schema.json");
    expect(sums).toContain("runs/artifact-descriptor.schema.json");
    expect(sums).toContain("runs/artifact-download.response.schema.json");
    expect(sums).toContain("events/run-event.schema.json");
    expect(sums).toContain("http/endpoint-matrix.json");
    expect(sums).toContain("capabilities/unsupported.schema.json");
    expect(sums).toContain("fixtures/idempotency-replay.json");
    expect(hasSkillRunConsumerLock()).toBe(true);
  });
});
