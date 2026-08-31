import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import {
  WORK_SKILL_RUN_CONTRACT_NAME,
  WORK_SKILL_RUN_CONTRACT_VERSION,
} from "../../shared/skill-run";

const REQUIRED_SHA256_ENTRIES = [
  "mcp/tools-list.response.schema.json",
  "mcp/tools-call.response.schema.json",
  "events/run-event.schema.json",
  "runs/artifact-descriptor.schema.json",
  "fixtures/skill-tools-list.json",
  "fixtures/tools-call-accepted.json",
] as const;

export interface SkillRunConsumerLock {
  contractName: string;
  contractVersion: string;
  providerRepository: string;
  tagName: string;
  tagTargetCommit: string;
  providerSha256sumsPath: string;
  sha256sumsPath: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseLock(raw: unknown): SkillRunConsumerLock | null {
  if (!isRecord(raw)) return null;
  const required: Array<keyof SkillRunConsumerLock> = [
    "contractName",
    "contractVersion",
    "providerRepository",
    "tagName",
    "tagTargetCommit",
    "providerSha256sumsPath",
    "sha256sumsPath",
  ];
  for (const key of required) {
    if (typeof raw[key] !== "string" || !String(raw[key]).trim()) {
      return null;
    }
  }
  return {
    contractName: String(raw.contractName).trim(),
    contractVersion: String(raw.contractVersion).trim(),
    providerRepository: String(raw.providerRepository).trim(),
    tagName: String(raw.tagName).trim(),
    tagTargetCommit: String(raw.tagTargetCommit).trim(),
    providerSha256sumsPath: String(raw.providerSha256sumsPath).trim(),
    sha256sumsPath: String(raw.sha256sumsPath).trim(),
  };
}

export function findSkillRunConsumerLockDir(): string | null {
  const contractsRoot = join(process.cwd(), "../../contracts/skill-run");
  if (!existsSync(contractsRoot)) {
    return null;
  }

  try {
    const entries = readdirSync(contractsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = join(contractsRoot, entry.name);
      const lockFile = join(dir, "consumer-lock.json");
      if (existsSync(lockFile)) {
        return dir;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function readSkillRunConsumerLock(): SkillRunConsumerLock | null {
  const dir = findSkillRunConsumerLockDir();
  if (!dir) return null;
  try {
    const lock = parseLock(
      JSON.parse(readFileSync(join(dir, "consumer-lock.json"), "utf8")),
    );
    if (!lock) return null;
    if (lock.contractName !== WORK_SKILL_RUN_CONTRACT_NAME) return null;
    if (lock.contractVersion !== WORK_SKILL_RUN_CONTRACT_VERSION) return null;
    const sumsPath = join(dir, lock.sha256sumsPath);
    if (!existsSync(sumsPath)) return null;
    const sums = readFileSync(sumsPath, "utf8");
    for (const entry of REQUIRED_SHA256_ENTRIES) {
      if (!sums.includes(entry)) return null;
    }
    return lock;
  } catch {
    return null;
  }
}

export function hasSkillRunConsumerLock(): boolean {
  return readSkillRunConsumerLock() !== null;
}
