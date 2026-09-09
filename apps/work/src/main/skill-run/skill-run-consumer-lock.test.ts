import { createHash } from "crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  WORK_SKILL_RUN_CONTRACT_NAME,
  WORK_SKILL_RUN_CONTRACT_VERSION,
} from "../../shared/skill-run";
import {
  hasSkillRunApprovalDecisionBundle,
  hasSkillRunAttachmentBundle,
  hasSkillRunStreamingDeltaBundle,
  isCompleteSkillRunBundleDir,
} from "./skill-run-consumer-lock";

function contractsSkillRunDir(version: string): string {
  const fromWork = join(process.cwd(), "../../contracts/skill-run", version);
  const fromRepo = join(process.cwd(), "contracts/skill-run", version);
  return existsSync(fromWork) ? fromWork : fromRepo;
}

const IDENTITY_LOCK_DIR = contractsSkillRunDir("v1.0.0");
const COMPLETE_LOCK_DIR = contractsSkillRunDir("v1.2.1");
const COMPLETE_LOCK_DIR_V130 = contractsSkillRunDir("v1.3.0");
const COMPLETE_LOCK_DIR_V140 = contractsSkillRunDir("v1.4.0");
const COMPLETE_LOCK_DIR_V150 = contractsSkillRunDir("v1.5.0");
const EXPERT_LOCK = (() => {
  const fromWork = join(
    process.cwd(),
    "../../contracts/work-expert/v1.0.2/consumer-lock.json",
  );
  const fromRepo = join(
    process.cwd(),
    "contracts/work-expert/v1.0.2/consumer-lock.json",
  );
  return existsSync(fromWork) ? fromWork : fromRepo;
})();

const FIXTURE_FILES: Record<string, string> = {
  "manifest.json": JSON.stringify({
    bundleVersion: "1.0.0-test",
    files: [],
  }),
  "capabilities/unsupported.schema.json": '{"type":"object"}',
  "events/run-event.schema.json": '{"type":"object"}',
  "fixtures/idempotency-replay.json": '{"ok":true}',
  "http/endpoint-matrix.json": '{"endpoints":[]}',
  "mcp/tools-list.request.schema.json": '{"type":"object"}',
  "mcp/tools-list.response.schema.json": '{"type":"object"}',
  "mcp/tools-call.request.schema.json": '{"type":"object"}',
  "mcp/tools-call.response.schema.json": '{"type":"object"}',
  "runs/public-run.schema.json": '{"type":"object"}',
  "runs/result.schema.json": '{"type":"object"}',
  "runs/artifact-list.schema.json": '{"type":"object"}',
  "runs/artifact-descriptor.schema.json": '{"type":"object"}',
  "runs/artifact-download.response.schema.json": '{"type":"object"}',
};

function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function writeCompleteFixture(root: string): void {
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, "consumer-lock.json"),
    JSON.stringify({
      contractName: "SKILL-RUN-CONTRACT",
      contractVersion: "1.0.0-test",
      tagName: "skill-run-contract-v1.0.0-test",
      tagTargetCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sha256sumsPath: "SHA256SUMS",
    }),
    "utf8",
  );

  const sumsLines: string[] = [];
  for (const [relativePath, content] of Object.entries(FIXTURE_FILES)) {
    const absolute = join(root, relativePath);
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, content, "utf8");
    sumsLines.push(`${sha256Hex(content)}  ${relativePath}`);
  }
  writeFileSync(join(root, "SHA256SUMS"), `${sumsLines.join("\n")}\n`, "utf8");
}

function copyBundle(source: string): string {
  const root = mkdtempSync(join(tmpdir(), "skill-run-bundle-copy-"));
  tempDirs.push(root);
  cpSync(source, root, { recursive: true });
  return root;
}

function rewriteListedHash(root: string, relativePath: string): void {
  const content = readFileSync(join(root, relativePath));
  const digest = createHash("sha256").update(content).digest("hex");
  const sumsPath = join(root, "SHA256SUMS");
  const next = readFileSync(sumsPath, "utf8")
    .split("\n")
    .map((line) => {
      if (!line.includes(` ${relativePath}`) && !line.endsWith(relativePath)) {
        return line;
      }
      const match = /^([0-9a-fA-F]{64}) [ *](.+)$/.exec(line);
      if (!match || match[2].trim() !== relativePath) {
        return line;
      }
      return `${digest}  ${relativePath}`;
    })
    .join("\n");
  writeFileSync(sumsPath, next.endsWith("\n") ? next : `${next}\n`, "utf8");
}

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("SKILL-RUN-CONTRACT consumer lock", () => {
  it("keeps identity-only v1.0.0 material but does not treat it as a closed lock", () => {
    const lock = JSON.parse(
      readFileSync(join(IDENTITY_LOCK_DIR, "consumer-lock.json"), "utf8"),
    ) as {
      contractName: string;
      contractVersion: string;
      tagName: string;
      tagTargetCommit: string;
      providerSha256sumsPath: string;
      sha256sumsPath: string;
    };
    const sumsBytes = readFileSync(join(IDENTITY_LOCK_DIR, "SHA256SUMS"));
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
    expect(existsSync(EXPERT_LOCK)).toBe(true);
    expect(isCompleteSkillRunBundleDir(IDENTITY_LOCK_DIR)).toBe(false);
  });

  it("opens the gate for the checksum-valid v1.2.1 Provider Bundle", () => {
    const lock = JSON.parse(
      readFileSync(join(COMPLETE_LOCK_DIR, "consumer-lock.json"), "utf8"),
    ) as {
      contractName: string;
      contractVersion: string;
      tagName: string;
      tagTargetCommit: string;
      providerSha256sumsPath: string;
      sha256sumsPath: string;
    };
    const sumsBytes = readFileSync(join(COMPLETE_LOCK_DIR, "SHA256SUMS"));

    expect(lock.contractName).toBe("SKILL-RUN-CONTRACT");
    expect(lock.contractVersion).toBe("1.2.1");
    expect(lock.tagName).toBe("skill-run-contract-v1.2.1");
    expect(lock.tagTargetCommit).toBe(
      "10d38f2c97739c4a55df893d1dc954fc8896f1a7",
    );
    expect(lock.providerSha256sumsPath).toBe(
      "nodeskclaw-backend/contracts/skill-run/v1.2.1/SHA256SUMS",
    );
    expect(lock.sha256sumsPath).toBe("SHA256SUMS");
    expect(sumsBytes.includes(0x0d)).toBe(false);
    expect(isCompleteSkillRunBundleDir(COMPLETE_LOCK_DIR)).toBe(true);
  });

  it("opens the gate for the checksum-valid v1.3.0 Provider Bundle", () => {
    const lock = JSON.parse(
      readFileSync(join(COMPLETE_LOCK_DIR_V130, "consumer-lock.json"), "utf8"),
    ) as {
      contractName: string;
      contractVersion: string;
      tagName: string;
      tagTargetCommit: string;
      providerSha256sumsPath: string;
      sha256sumsPath: string;
    };
    const sumsBytes = readFileSync(join(COMPLETE_LOCK_DIR_V130, "SHA256SUMS"));
    const manifest = JSON.parse(
      readFileSync(join(COMPLETE_LOCK_DIR_V130, "manifest.json"), "utf8"),
    ) as {
      capabilities?: Record<string, unknown>;
    };
    const unsupported = JSON.parse(
      readFileSync(
        join(COMPLETE_LOCK_DIR_V130, "capabilities/unsupported.schema.json"),
        "utf8",
      ),
    ) as { properties?: Record<string, unknown> };

    expect(lock.contractName).toBe("SKILL-RUN-CONTRACT");
    expect(lock.contractVersion).toBe("1.3.0");
    expect(lock.tagName).toBe("skill-run-contract-v1.3.0");
    expect(lock.tagTargetCommit).toBe(
      "26e1cb5aa2aebbb4bdc1a8e1c65617aaa6b6c948",
    );
    expect(lock.providerSha256sumsPath).toBe(
      "nodeskclaw-backend/contracts/skill-run/v1.3.0/SHA256SUMS",
    );
    expect(lock.sha256sumsPath).toBe("SHA256SUMS");
    expect(sumsBytes.includes(0x0d)).toBe(false);
    expect(manifest.capabilities?.approvalDecision).toBe("supported");
    expect(manifest.capabilities?.approval).toBe("supported");
    expect(manifest.capabilities?.attachments).toBe("unsupported");
    expect(unsupported.properties).toHaveProperty("attachments");
    expect(unsupported.properties).not.toHaveProperty("approval");
    expect(isCompleteSkillRunBundleDir(COMPLETE_LOCK_DIR_V130)).toBe(true);
    expect(hasSkillRunApprovalDecisionBundle()).toBe(true);
  });

  it("opens the gate for the checksum-valid v1.4.0 Provider Bundle", () => {
    const lock = JSON.parse(
      readFileSync(join(COMPLETE_LOCK_DIR_V140, "consumer-lock.json"), "utf8"),
    ) as {
      contractName: string;
      contractVersion: string;
      tagName: string;
      tagTargetCommit: string;
      providerSha256sumsPath: string;
      sha256sumsPath: string;
    };
    const sumsBytes = readFileSync(join(COMPLETE_LOCK_DIR_V140, "SHA256SUMS"));
    const sums = sumsBytes.toString("utf8");
    const manifest = JSON.parse(
      readFileSync(join(COMPLETE_LOCK_DIR_V140, "manifest.json"), "utf8"),
    ) as {
      capabilities?: Record<string, unknown>;
    };
    const unsupported = JSON.parse(
      readFileSync(
        join(COMPLETE_LOCK_DIR_V140, "capabilities/unsupported.schema.json"),
        "utf8",
      ),
    ) as { properties?: Record<string, unknown> };

    expect(lock.contractName).toBe("SKILL-RUN-CONTRACT");
    expect(lock.contractVersion).toBe("1.4.0");
    expect(lock.tagName).toBe("skill-run-contract-v1.4.0");
    expect(lock.tagTargetCommit).toBe(
      "5d0e538fa68655f0084850d5378398f622ed90ba",
    );
    expect(lock.providerSha256sumsPath).toBe(
      "nodeskclaw-backend/contracts/skill-run/v1.4.0/SHA256SUMS",
    );
    expect(lock.sha256sumsPath).toBe("SHA256SUMS");
    expect(sumsBytes.includes(0x0d)).toBe(false);
    expect(sums).toContain("runs/attachment-upload.response.schema.json");
    expect(sums).toContain("runs/attachment-error.schema.json");
    expect(sums).toContain("fixtures/tools-call-attachment-binding.json");
    expect(manifest.capabilities?.attachments).toBe("supported");
    expect(manifest.capabilities?.approvalDecision).toBe("supported");
    expect(manifest.capabilities?.approvalExpiry).toBe("unsupported");
    expect(unsupported.properties).toHaveProperty("attachments");
    expect(unsupported.properties).not.toHaveProperty("approval");
    expect(isCompleteSkillRunBundleDir(COMPLETE_LOCK_DIR_V140)).toBe(true);
    expect(hasSkillRunAttachmentBundle()).toBe(true);
  });

  it("keeps P0 required paths free of approval-decision schemas", () => {
    const sourcePath = join(
      process.cwd(),
      "src/main/skill-run/skill-run-consumer-lock.ts",
    );
    const source = existsSync(sourcePath)
      ? readFileSync(sourcePath, "utf8")
      : readFileSync(
          join(process.cwd(), "apps/work/src/main/skill-run/skill-run-consumer-lock.ts"),
          "utf8",
        );
    expect(source).not.toContain("approval-decision.request.schema.json");
    expect(source).not.toContain("approval-decision.response.schema.json");
    expect(source).not.toContain("attachment-upload.response.schema.json");
    expect(source).not.toContain("attachment-error.schema.json");
    expect(isCompleteSkillRunBundleDir(IDENTITY_LOCK_DIR)).toBe(false);
    expect(isCompleteSkillRunBundleDir(COMPLETE_LOCK_DIR)).toBe(true);
    expect(isCompleteSkillRunBundleDir(COMPLETE_LOCK_DIR_V140)).toBe(true);
    expect(hasSkillRunApprovalDecisionBundle()).toBe(
      isCompleteSkillRunBundleDir(COMPLETE_LOCK_DIR_V130),
    );
    expect(hasSkillRunAttachmentBundle()).toBe(
      isCompleteSkillRunBundleDir(COMPLETE_LOCK_DIR_V140),
    );
    expect(source).toContain("hasSkillRunAttachmentBundle");
    expect(source).toContain("contracts/skill-run/v1.4.0");
    const requiredBlock = source.slice(
      source.indexOf("const REQUIRED_BUNDLE_PATHS"),
      source.indexOf("] as const;"),
    );
    expect(requiredBlock).not.toContain("fixtures/run-event-assistant-delta.json");
    expect(requiredBlock).not.toContain("fixtures/sse-assistant-delta-replay.json");
    expect(source).toContain("hasSkillRunStreamingDeltaBundle");
    expect(source).toContain("contracts/skill-run/v1.5.0");
  });

  it("accepts a checksum-valid complete Bundle fixture", () => {
    const root = mkdtempSync(join(tmpdir(), "skill-run-bundle-"));
    tempDirs.push(root);
    writeCompleteFixture(root);
    expect(isCompleteSkillRunBundleDir(root)).toBe(true);
  });

  it("rejects SHA256 mismatch or missing manifest", () => {
    const root = mkdtempSync(join(tmpdir(), "skill-run-bundle-bad-"));
    tempDirs.push(root);
    writeCompleteFixture(root);
    writeFileSync(
      join(root, "manifest.json"),
      '{"bundleVersion":"tampered"}',
      "utf8",
    );
    expect(isCompleteSkillRunBundleDir(root)).toBe(false);

    const missing = mkdtempSync(join(tmpdir(), "skill-run-bundle-miss-"));
    tempDirs.push(missing);
    writeCompleteFixture(missing);
    rmSync(join(missing, "manifest.json"), { force: true });
    expect(isCompleteSkillRunBundleDir(missing)).toBe(false);
  });

  it("rejects CRLF SHA256SUMS", () => {
    const root = mkdtempSync(join(tmpdir(), "skill-run-bundle-crlf-"));
    tempDirs.push(root);
    writeCompleteFixture(root);
    const sumsPath = join(root, "SHA256SUMS");
    const lfSums = readFileSync(sumsPath, "utf8");
    writeFileSync(sumsPath, lfSums.replace(/\n/g, "\r\n"), "utf8");
    expect(isCompleteSkillRunBundleDir(root)).toBe(false);
  });

  it("rejects SHA256SUMS that omit a required P0 path", () => {
    const root = mkdtempSync(join(tmpdir(), "skill-run-bundle-omit-"));
    tempDirs.push(root);
    writeCompleteFixture(root);
    const sumsPath = join(root, "SHA256SUMS");
    const filtered = readFileSync(sumsPath, "utf8")
      .split("\n")
      .filter((line) => !line.includes("manifest.json"))
      .join("\n");
    writeFileSync(sumsPath, filtered.endsWith("\n") ? filtered : `${filtered}\n`, "utf8");
    expect(isCompleteSkillRunBundleDir(root)).toBe(false);
  });

  it("opens the v1.5.0 streaming-delta gate only for the published contract shape", () => {
    const lock = JSON.parse(
      readFileSync(join(COMPLETE_LOCK_DIR_V150, "consumer-lock.json"), "utf8"),
    ) as {
      contractName: string;
      contractVersion: string;
      tagName: string;
      tagTargetCommit: string;
      providerSha256sumsPath: string;
      sha256sumsPath: string;
    };
    const sumsBytes = readFileSync(join(COMPLETE_LOCK_DIR_V150, "SHA256SUMS"));
    const sums = sumsBytes.toString("utf8");
    const manifest = JSON.parse(
      readFileSync(join(COMPLETE_LOCK_DIR_V150, "manifest.json"), "utf8"),
    ) as { capabilities?: Record<string, unknown> };
    const schema = JSON.parse(
      readFileSync(
        join(COMPLETE_LOCK_DIR_V150, "events/run-event.schema.json"),
        "utf8",
      ),
    ) as {
      oneOf?: Array<{
        properties?: { event_type?: { const?: string }; payload?: { $ref?: string } };
      }>;
      $defs?: { AssistantDeltaPayloadV15?: { required?: string[] } };
    };
    const deltaBranch = schema.oneOf?.find(
      (branch) => branch.properties?.event_type?.const === "assistant.delta",
    );

    expect(lock.contractName).toBe("SKILL-RUN-CONTRACT");
    expect(lock.contractVersion).toBe("1.5.0");
    expect(lock.tagName).toBe("skill-run-contract-v1.5.0");
    expect(lock.tagTargetCommit).toBe(
      "3a7fa5ac32017d41f7191b8221c861b93d7e7f32",
    );
    expect(lock.providerSha256sumsPath).toBe(
      "nodeskclaw-backend/contracts/skill-run/v1.5.0/SHA256SUMS",
    );
    expect(lock.sha256sumsPath).toBe("SHA256SUMS");
    expect(sumsBytes.includes(0x0d)).toBe(false);
    expect(sums).toContain("fixtures/run-event-assistant-delta.json");
    expect(sums).toContain("fixtures/sse-assistant-delta-replay.json");
    expect(manifest.capabilities?.streamingDelta).toBe("supported");
    expect(manifest.capabilities?.assistantMessageSnapshot).toBe("supported");
    expect(deltaBranch?.properties?.payload?.$ref).toBe(
      "#/$defs/AssistantDeltaPayloadV15",
    );
    expect(schema.$defs?.AssistantDeltaPayloadV15?.required).toEqual(
      expect.arrayContaining(["message_id", "delta_seq", "delta"]),
    );
    expect(isCompleteSkillRunBundleDir(COMPLETE_LOCK_DIR_V150)).toBe(true);
    expect(hasSkillRunStreamingDeltaBundle()).toBe(true);
    expect(isCompleteSkillRunBundleDir(COMPLETE_LOCK_DIR)).toBe(true);
    expect(hasSkillRunStreamingDeltaBundle(COMPLETE_LOCK_DIR)).toBe(false);
    expect(isCompleteSkillRunBundleDir(COMPLETE_LOCK_DIR_V130)).toBe(true);
    expect(hasSkillRunStreamingDeltaBundle(COMPLETE_LOCK_DIR_V130)).toBe(false);
    expect(isCompleteSkillRunBundleDir(COMPLETE_LOCK_DIR_V140)).toBe(true);
    expect(hasSkillRunStreamingDeltaBundle(COMPLETE_LOCK_DIR_V140)).toBe(false);
  });

  it("rejects v1.5 streaming-delta eligibility on tamper, CRLF, shape, fixture and wrong version", () => {
    const tampered = copyBundle(COMPLETE_LOCK_DIR_V150);
    writeFileSync(join(tampered, "manifest.json"), '{"tampered":true}', "utf8");
    expect(isCompleteSkillRunBundleDir(tampered)).toBe(false);
    expect(hasSkillRunStreamingDeltaBundle(tampered)).toBe(false);

    const missingAsset = copyBundle(COMPLETE_LOCK_DIR_V150);
    rmSync(join(missingAsset, "manifest.json"), { force: true });
    expect(isCompleteSkillRunBundleDir(missingAsset)).toBe(false);
    expect(hasSkillRunStreamingDeltaBundle(missingAsset)).toBe(false);

    const crlf = copyBundle(COMPLETE_LOCK_DIR_V150);
    const crlfSums = join(crlf, "SHA256SUMS");
    writeFileSync(
      crlfSums,
      readFileSync(crlfSums, "utf8").replace(/\n/g, "\r\n"),
      "utf8",
    );
    expect(isCompleteSkillRunBundleDir(crlf)).toBe(false);
    expect(hasSkillRunStreamingDeltaBundle(crlf)).toBe(false);

    const missingCapability = copyBundle(COMPLETE_LOCK_DIR_V150);
    const missingCapabilityManifest = JSON.parse(
      readFileSync(join(missingCapability, "manifest.json"), "utf8"),
    ) as { capabilities: Record<string, unknown> };
    delete missingCapabilityManifest.capabilities.streamingDelta;
    writeFileSync(
      join(missingCapability, "manifest.json"),
      `${JSON.stringify(missingCapabilityManifest, null, 2)}\n`,
      "utf8",
    );
    rewriteListedHash(missingCapability, "manifest.json");
    expect(isCompleteSkillRunBundleDir(missingCapability)).toBe(true);
    expect(hasSkillRunStreamingDeltaBundle(missingCapability)).toBe(false);

    const unsupportedCapability = copyBundle(COMPLETE_LOCK_DIR_V150);
    const unsupportedManifest = JSON.parse(
      readFileSync(join(unsupportedCapability, "manifest.json"), "utf8"),
    ) as { capabilities: Record<string, unknown> };
    unsupportedManifest.capabilities.streamingDelta = "unsupported";
    writeFileSync(
      join(unsupportedCapability, "manifest.json"),
      `${JSON.stringify(unsupportedManifest, null, 2)}\n`,
      "utf8",
    );
    rewriteListedHash(unsupportedCapability, "manifest.json");
    expect(isCompleteSkillRunBundleDir(unsupportedCapability)).toBe(true);
    expect(hasSkillRunStreamingDeltaBundle(unsupportedCapability)).toBe(false);

    const missingField = copyBundle(COMPLETE_LOCK_DIR_V150);
    const schema = JSON.parse(
      readFileSync(join(missingField, "events/run-event.schema.json"), "utf8"),
    ) as { $defs: { AssistantDeltaPayloadV15: { required: string[] } } };
    schema.$defs.AssistantDeltaPayloadV15.required = ["message_id", "delta_seq"];
    writeFileSync(
      join(missingField, "events/run-event.schema.json"),
      `${JSON.stringify(schema)}\n`,
      "utf8",
    );
    rewriteListedHash(missingField, "events/run-event.schema.json");
    expect(isCompleteSkillRunBundleDir(missingField)).toBe(true);
    expect(hasSkillRunStreamingDeltaBundle(missingField)).toBe(false);

    const missingFixture = copyBundle(COMPLETE_LOCK_DIR_V150);
    const sumsPath = join(missingFixture, "SHA256SUMS");
    const filtered = readFileSync(sumsPath, "utf8")
      .split("\n")
      .filter((line) => !line.includes("fixtures/run-event-assistant-delta.json"))
      .join("\n");
    writeFileSync(
      sumsPath,
      filtered.endsWith("\n") ? filtered : `${filtered}\n`,
      "utf8",
    );
    expect(isCompleteSkillRunBundleDir(missingFixture)).toBe(true);
    expect(hasSkillRunStreamingDeltaBundle(missingFixture)).toBe(false);

    expect(isCompleteSkillRunBundleDir(COMPLETE_LOCK_DIR_V140)).toBe(true);
    expect(hasSkillRunStreamingDeltaBundle(COMPLETE_LOCK_DIR_V140)).toBe(false);
    expect(hasSkillRunStreamingDeltaBundle()).toBe(true);
  });
});
