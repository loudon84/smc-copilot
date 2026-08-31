import { createHash } from "crypto";
import {
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
  hasSkillRunConsumerLock,
  isCompleteSkillRunBundleDir,
} from "./skill-run-consumer-lock";

const LOCK_DIR = join(process.cwd(), "../../contracts/skill-run/v1.0.0");
const EXPERT_LOCK = join(
  process.cwd(),
  "../../contracts/work-expert/v1.0.2/consumer-lock.json",
);

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
    expect(existsSync(EXPERT_LOCK)).toBe(true);
    expect(isCompleteSkillRunBundleDir(LOCK_DIR)).toBe(false);
    expect(hasSkillRunConsumerLock()).toBe(false);
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
});
