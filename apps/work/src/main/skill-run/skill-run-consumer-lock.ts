import { createHash } from "crypto";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

/** Paths that must appear in SHA256SUMS for a P0 Skill Run Bundle to be complete. */
const REQUIRED_BUNDLE_PATHS = [
  "manifest.json",
  "capabilities/unsupported.schema.json",
  "events/run-event.schema.json",
  "fixtures/idempotency-replay.json",
  "http/endpoint-matrix.json",
  "mcp/tools-list.request.schema.json",
  "mcp/tools-list.response.schema.json",
  "mcp/tools-call.request.schema.json",
  "mcp/tools-call.response.schema.json",
  "runs/public-run.schema.json",
  "runs/result.schema.json",
  "runs/artifact-list.schema.json",
  "runs/artifact-descriptor.schema.json",
  "runs/artifact-download.response.schema.json",
] as const;

const SHA256SUMS_LINE =
  /^([0-9a-fA-F]{64}) [ *](.+)$/;

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseSha256Sums(
  sumsText: string,
): Array<{ hash: string; relativePath: string }> | null {
  if (sumsText.includes("\r")) {
    return null;
  }
  const entries: Array<{ hash: string; relativePath: string }> = [];
  for (const rawLine of sumsText.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const match = SHA256SUMS_LINE.exec(line);
    if (!match) {
      return null;
    }
    entries.push({
      hash: match[1].toLowerCase(),
      relativePath: match[2].trim().replace(/^\.\//, ""),
    });
  }
  return entries.length > 0 ? entries : null;
}

/**
 * Returns true only when `dir` is a checksum-valid complete Skill Run Bundle:
 * consumer-lock.json, LF SHA256SUMS with matching file digests, manifest.json,
 * and the P0 schema/matrix/fixture paths.
 */
export function isCompleteSkillRunBundleDir(dir: string): boolean {
  const lockFile = join(dir, "consumer-lock.json");
  const sumsFile = join(dir, "SHA256SUMS");
  if (!existsSync(lockFile) || !existsSync(sumsFile)) {
    return false;
  }

  let sumsBytes: Buffer;
  try {
    sumsBytes = readFileSync(sumsFile);
  } catch {
    return false;
  }
  if (sumsBytes.includes(0x0d)) {
    return false;
  }

  const entries = parseSha256Sums(sumsBytes.toString("utf8"));
  if (!entries) {
    return false;
  }

  const listed = new Set(entries.map((entry) => entry.relativePath));
  for (const required of REQUIRED_BUNDLE_PATHS) {
    if (!listed.has(required)) {
      return false;
    }
  }

  for (const entry of entries) {
    if (entry.relativePath.includes("..") || entry.relativePath.startsWith("/")) {
      return false;
    }
    const absolute = join(dir, entry.relativePath);
    if (!existsSync(absolute)) {
      return false;
    }
    let content: Buffer;
    try {
      content = readFileSync(absolute);
    } catch {
      return false;
    }
    if (sha256Hex(content) !== entry.hash) {
      return false;
    }
  }

  return true;
}

export function findSkillRunConsumerLockDir(): string | null {
  const contractsRoot = join(process.cwd(), "../../contracts/skill-run");
  if (!existsSync(contractsRoot)) {
    return null;
  }

  try {
    const entries = readdirSync(contractsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const candidate = join(contractsRoot, entry.name);
      if (isCompleteSkillRunBundleDir(candidate)) {
        return candidate;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function hasSkillRunConsumerLock(): boolean {
  return findSkillRunConsumerLockDir() !== null;
}

/**
 * Decision HTTP is v1.3.0-only. Do not use first-complete P0 finder here:
 * a checksum-complete v1.2.1 bundle must still open Catalog/start.
 */
export function hasSkillRunApprovalDecisionBundle(): boolean {
  const fromWork = join(process.cwd(), "../../contracts/skill-run/v1.3.0");
  const fromRepo = join(process.cwd(), "contracts/skill-run/v1.3.0");
  const dir = existsSync(fromWork) ? fromWork : fromRepo;
  return isCompleteSkillRunBundleDir(dir);
}
