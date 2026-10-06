import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

export const FRONTEND_BUNDLE_DIGEST =
  "3de6c671bd9b22c5d6e35855f9dbb3f8432a6f0291df21b4824dc6ff9a0df43a";

export const REQUIRED_CONSUMER_LOCK_KEYS = [
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

export type ConsumerLock = {
  contractName: "REMOTE-EXPERT-FRONTEND-CONTRACT";
  contractVersion: "2.0.0";
  providerRepository: "loudon84/nodeskclaw";
  tagName: "remote-expert-frontend-contract-v2.0.0";
  tagTargetCommit: "5d36d6f7bebe1e70e7e031eaf384e124c76d98bc";
  frontendContractVersion: "2.0.0";
  frontendContractDigest: string;
  catalogContractVersion: "1.1.0";
  catalogContractDigest: string;
  remoteAcpContractVersion: "1.0.0";
  remoteAcpContractDigest: string;
  acpProtocolVersion: 1;
  transportProfile: "nodeskclaw.remote-acp.v1";
};

export class RemoteExpertLockError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "RemoteExpertLockError";
    this.code = code;
  }
}

export function sha256OfFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function sha256CanonicalLf(path: string): string {
  const raw = readFileSync(path);
  const lf = Buffer.from(
    raw.toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n"),
    "utf8",
  );
  return createHash("sha256").update(lf).digest("hex");
}

export function resolveFrontendContractRoot(cwd = process.cwd()): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(cwd, "contracts/remote-expert-frontend/v2.0.0"),
    join(cwd, "../contracts/remote-expert-frontend/v2.0.0"),
    join(cwd, "../../contracts/remote-expert-frontend/v2.0.0"),
    resolve(here, "../../../../../contracts/remote-expert-frontend/v2.0.0"),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "consumer-lock.json"))) {
      return candidate;
    }
  }
  throw new RemoteExpertLockError(
    "ACP_CONTRACT_LOCK_MISSING",
    "REMOTE-EXPERT-FRONTEND-CONTRACT v2.0.0 consumer-lock.json not found",
  );
}

function parseSha256Sums(raw: Buffer): Array<{ hash: string; relativePath: string }> {
  if (raw.includes(0x0d)) {
    throw new RemoteExpertLockError(
      "REMOTE_EXPERT_PROVIDER_INCOMPATIBLE",
      "SHA256SUMS must be LF-only",
    );
  }
  const entries: Array<{ hash: string; relativePath: string }> = [];
  for (const line of raw.toString("utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.indexOf("  ") !== 64) {
      throw new RemoteExpertLockError(
        "REMOTE_EXPERT_PROVIDER_INCOMPATIBLE",
        "invalid SHA256SUMS line",
      );
    }
    entries.push({
      hash: trimmed.slice(0, 64).toLowerCase(),
      relativePath: trimmed.slice(66),
    });
  }
  return entries;
}

export function verifyVendoredSha256Sums(root: string): string {
  const sumsPath = join(root, "SHA256SUMS");
  const raw = readFileSync(sumsPath);
  const entries = parseSha256Sums(raw);
  for (const entry of entries) {
    const actual = sha256CanonicalLf(join(root, entry.relativePath));
    if (actual !== entry.hash) {
      throw new RemoteExpertLockError(
        "REMOTE_EXPERT_PROVIDER_INCOMPATIBLE",
        `checksum mismatch for ${entry.relativePath}`,
      );
    }
  }
  return createHash("sha256").update(raw).digest("hex");
}

export function loadConsumerLock(root: string): ConsumerLock {
  const path = join(root, "consumer-lock.json");
  if (!existsSync(path)) {
    throw new RemoteExpertLockError(
      "ACP_CONTRACT_LOCK_MISSING",
      "consumer-lock.json missing",
    );
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const keys = Object.keys(parsed);
  if (keys.length !== REQUIRED_CONSUMER_LOCK_KEYS.length) {
    throw new RemoteExpertLockError(
      "REMOTE_EXPERT_PROVIDER_INCOMPATIBLE",
      "consumer-lock.json extra or missing fields",
    );
  }
  for (const key of REQUIRED_CONSUMER_LOCK_KEYS) {
    if (!(key in parsed)) {
      throw new RemoteExpertLockError(
        "REMOTE_EXPERT_PROVIDER_INCOMPATIBLE",
        `consumer-lock.json missing ${key}`,
      );
    }
  }
  return parsed as ConsumerLock;
}

export function verifyConsumerLock(root: string): ConsumerLock {
  const lock = loadConsumerLock(root);
  const sumsPath = join(root, "SHA256SUMS");
  const digest = sha256OfFile(sumsPath);
  if (digest !== lock.frontendContractDigest) {
    throw new RemoteExpertLockError(
      "REMOTE_EXPERT_PROVIDER_INCOMPATIBLE",
      "frontendContractDigest does not match SHA256(SHA256SUMS)",
    );
  }
  verifyVendoredSha256Sums(root);
  if (lock.frontendContractDigest === FRONTEND_BUNDLE_DIGEST) {
    throw new RemoteExpertLockError(
      "REMOTE_EXPERT_PROVIDER_INCOMPATIBLE",
      "frontendContractDigest must not equal bundleDigest",
    );
  }
  if (lock.acpProtocolVersion !== 1) {
    throw new RemoteExpertLockError(
      "REMOTE_EXPERT_PROVIDER_INCOMPATIBLE",
      "acpProtocolVersion must be 1",
    );
  }
  if (lock.transportProfile !== "nodeskclaw.remote-acp.v1") {
    throw new RemoteExpertLockError(
      "REMOTE_EXPERT_PROVIDER_INCOMPATIBLE",
      "transportProfile mismatch",
    );
  }
  return lock;
}

