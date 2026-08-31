import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  WORK_SKILL_RUN_CONTRACT_NAME,
  WORK_SKILL_RUN_CONTRACT_VERSION,
} from "../../shared/skill-run";
import {
  hasSkillRunConsumerLock,
  readSkillRunConsumerLock,
} from "./skill-run-consumer-lock";
import { parseSkillCatalogTools } from "./skill-run-contract-parser";

const LOCK_DIR = join(process.cwd(), "../../contracts/skill-run/v1.2.0");

describe("WORK-SKILL-RUN-CONTRACT consumer lock", () => {
  it("pins version 1.2.0 against consumer-lock.json and checksum artifacts", () => {
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
    const sums = readFileSync(join(LOCK_DIR, "SHA256SUMS"), "utf8");

    expect(WORK_SKILL_RUN_CONTRACT_NAME).toBe("WORK-SKILL-RUN-CONTRACT");
    expect(WORK_SKILL_RUN_CONTRACT_VERSION).toBe("1.2.0");
    expect(lock.contractName).toBe("WORK-SKILL-RUN-CONTRACT");
    expect(lock.contractVersion).toBe("1.2.0");
    expect(lock.tagName).toBe("skill-run-contract-v1.2.0");
    expect(lock.tagTargetCommit).toBe(
      "e3744c4bd73479a32155dcd11d7f8b87c7cc6f2b",
    );
    expect(lock.providerSha256sumsPath).toBe(
      "nodeskclaw-backend/contracts/skill-run/v1.2.0/SHA256SUMS",
    );
    expect(lock.sha256sumsPath).toBe("SHA256SUMS");
    expect(sums).toContain("mcp/tools-list.response.schema.json");
    expect(sums).toContain("mcp/tools-call.response.schema.json");
    expect(sums).toContain("events/run-event.schema.json");
    expect(sums).toContain("runs/artifact-descriptor.schema.json");
    expect(sums).toContain("fixtures/skill-tools-list.json");
    expect(sums).toContain("fixtures/tools-call-accepted.json");
    expect(hasSkillRunConsumerLock()).toBe(true);
    expect(readSkillRunConsumerLock()?.tagName).toBe(
      "skill-run-contract-v1.2.0",
    );
  });
});

describe("skill catalog discriminator", () => {
  it("keeps capabilityKind=skill tools and drops connectors", () => {
    const parsed = parseSkillCatalogTools([
      {
        name: "writer_article_generate",
        title: "Writer",
        capabilityKind: "skill",
        interactionMode: "chat",
        category: "writer",
        inputSchema: {
          type: "object",
          properties: { prompt: { type: "string" } },
        },
      },
      {
        name: "public_drive",
        title: "Drive",
        capabilityKind: "connector",
        interactionMode: "chat",
      },
    ]);
    expect(parsed.status).toBe("ready");
    if (parsed.status === "ready") {
      expect(parsed.tools).toEqual([
        expect.objectContaining({
          toolName: "writer_article_generate",
          title: "Writer",
          callability: "callable",
          category: "writer",
        }),
      ]);
    }
  });

  it("fails closed when capabilityKind is missing instead of guessing", () => {
    const parsed = parseSkillCatalogTools([
      { name: "writer_article_generate", title: "Writer" },
    ]);
    expect(parsed.status).toBe("contract-unsupported");
    expect(parsed.tools).toEqual([]);
  });
});
