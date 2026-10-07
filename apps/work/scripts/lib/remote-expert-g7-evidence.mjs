import { existsSync, readFileSync } from "fs";
import { join } from "path";

export const CLAIM_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export const FULL_LIVE_IDS = Array.from({ length: 16 }, (_, i) =>
  `A-G7-LIVE-${String(i + 1).padStart(3, "0")}`,
);

export const PRERUN_LIVE_IDS = [
  "A-G7-LIVE-001",
  "A-G7-LIVE-002",
  "A-G7-LIVE-003",
];

export function resolveConsumerLock(repoRoot) {
  const path = join(
    repoRoot,
    "contracts/remote-expert-frontend/v2.1.0/consumer-lock.json",
  );
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function readDesktopVersion(workRoot) {
  try {
    const pkg = JSON.parse(
      readFileSync(join(workRoot, "package.json"), "utf8"),
    );
    return typeof pkg.version === "string" ? pkg.version : null;
  } catch {
    return null;
  }
}

export function computeGateTimestamps(overall, now = new Date()) {
  if (overall !== "PASS") {
    return {
      productionGate: "unpassed",
      claimAuthorized: false,
      passedAt: null,
      expiresAt: null,
    };
  }
  const passedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + CLAIM_WINDOW_MS).toISOString();
  return {
    productionGate: "passed",
    claimAuthorized: false,
    passedAt,
    expiresAt,
  };
}

export function buildProviderBlock(lock, agentRef) {
  return {
    frontendContractVersion: lock?.frontendContractVersion ?? "2.1.0",
    frontendContractDigest: lock?.frontendContractDigest ?? null,
    catalogContractDigest: lock?.catalogContractDigest ?? null,
    remoteAcpContractDigest: lock?.remoteAcpContractDigest ?? null,
    agentRef: agentRef ?? null,
  };
}

export function isClaimWindowOpen(evidence, now = new Date()) {
  if (evidence?.productionGate !== "passed") return false;
  if (evidence?.overall !== "PASS") return false;
  if (!evidence?.expiresAt) return false;
  const expires = Date.parse(evidence.expiresAt);
  if (Number.isNaN(expires)) return false;
  return now.getTime() <= expires;
}
