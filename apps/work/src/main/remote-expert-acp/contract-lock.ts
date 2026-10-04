import { createHash } from "crypto";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { RemoteExpertError } from "../../shared/remote-expert-acp/errors";

const SKIP_BUNDLE_DIGEST_NAMES = new Set(["manifest.json", "SHA256SUMS", "BUNDLE_DIGEST"]);

export interface ContractLockFile {
  tag: string;
  tagObjectSha: string;
  targetCommit: string;
  implementationCommit: string;
  bundleDigest: string;
  protocolVersion: number;
  adapterBinaryVersion: string;
  frontendContractGate: "passed" | "pending";
  productionGate: "passed" | "unpassed";
  components: {
    remoteExpertCatalog: { version: string; consumerDigest: string };
    acpAdapter: { version: string; consumerDigest: string };
    remoteAgent: {
      version: string;
      consumerDigest: string;
      consumerDigestLfMaterialization: string;
    };
  };
  vendorRoots: {
    frontend: string;
    catalog: string;
    acpAdapter: string;
    remoteAgent: string;
  };
}

export interface CompatibleContractPin {
  lock: ContractLockFile;
  root: string;
}

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function digestMaterializations(bytes: Buffer): { raw: string; lf: string; crlf: string } {
  const lf = Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "utf8");
  const crlf = Buffer.from(lf.toString("utf8").replace(/\n/g, "\r\n"), "utf8");
  return { raw: sha256Hex(bytes), lf: sha256Hex(lf), crlf: sha256Hex(crlf) };
}

function parseSha256Sums(raw: Buffer): Array<{ hash: string; relativePath: string }> {
  if (raw.includes(0x0d)) {
    throw new RemoteExpertError(
      "ACP_CONTRACT_INCOMPATIBLE",
      "SHA256SUMS must be LF-only",
    );
  }
  const entries: Array<{ hash: string; relativePath: string }> = [];
  for (const line of raw.toString("utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const sep = trimmed.indexOf("  ");
    if (sep !== 64) {
      throw new RemoteExpertError(
        "ACP_CONTRACT_INCOMPATIBLE",
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

function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, rel);
      else if (entry.name !== "SHA256SUMS") out.push(rel.replace(/\\/g, "/"));
    }
  };
  walk(root, "");
  return out.sort();
}

export function consumerDigestOfSums(sumsBytes: Buffer): string {
  return sha256Hex(sumsBytes);
}

export function bundleDigestFromChecksumText(checksumText: string): string {
  const lines: Array<[string, string]> = [];
  for (const raw of checksumText.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const digest = line.slice(0, 64);
    const relative = line.slice(66);
    if (!relative || SKIP_BUNDLE_DIGEST_NAMES.has(relative)) continue;
    lines.push([relative, `${digest}  ${relative}`]);
  }
  lines.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const body = `${lines.map(([, item]) => item).join("\n")}\n`;
  return sha256Hex(Buffer.from(body, "utf8"));
}

export function verifyComponentChecksums(root: string): string {
  const sumsPath = join(root, "SHA256SUMS");
  if (!existsSync(sumsPath)) {
    throw new RemoteExpertError(
      "ACP_CONTRACT_INCOMPATIBLE",
      `SHA256SUMS missing under ${root}`,
    );
  }
  const sumsBytes = readFileSync(sumsPath);
  const listed = parseSha256Sums(sumsBytes);
  const actual = new Set(listFiles(root));
  const listedSet = new Set(listed.map((e) => e.relativePath));
  if (!listedSet.has("manifest.json")) {
    throw new RemoteExpertError(
      "ACP_CONTRACT_INCOMPATIBLE",
      "SHA256SUMS must include manifest.json",
    );
  }
  for (const path of actual) {
    if (!listedSet.has(path)) {
      throw new RemoteExpertError(
        "ACP_CONTRACT_INCOMPATIBLE",
        `SHA256SUMS missing ${path}`,
      );
    }
  }
  for (const path of listedSet) {
    if (!actual.has(path)) {
      throw new RemoteExpertError(
        "ACP_CONTRACT_INCOMPATIBLE",
        `SHA256SUMS extra ${path}`,
      );
    }
  }
  for (const entry of listed) {
    if (entry.relativePath.includes("..")) {
      throw new RemoteExpertError(
        "ACP_CONTRACT_INCOMPATIBLE",
        "path traversal in SHA256SUMS",
      );
    }
    const bytes = readFileSync(join(root, entry.relativePath));
    const mats = digestMaterializations(bytes);
    if (![mats.raw, mats.lf, mats.crlf].includes(entry.hash)) {
      throw new RemoteExpertError(
        "ACP_CONTRACT_INCOMPATIBLE",
        `digest mismatch for ${entry.relativePath}`,
      );
    }
  }
  return consumerDigestOfSums(sumsBytes);
}

export function resolveContractRoot(cwd = process.cwd()): string {
  const fromWork = join(
    cwd,
    "contracts/nodeskclaw/remote-expert-frontend-v1.0.0",
  );
  if (existsSync(join(fromWork, "contract-lock.json"))) return fromWork;
  const fromRepo = join(
    cwd,
    "apps/work/contracts/nodeskclaw/remote-expert-frontend-v1.0.0",
  );
  return fromRepo;
}

export function loadContractLock(root = resolveContractRoot()): ContractLockFile {
  const path = join(root, "contract-lock.json");
  if (!existsSync(path)) {
    throw new RemoteExpertError(
      "ACP_CONTRACT_LOCK_MISSING",
      "contract-lock.json is missing",
    );
  }
  return JSON.parse(readFileSync(path, "utf8")) as ContractLockFile;
}

export function verifyPinnedContract(root = resolveContractRoot()): CompatibleContractPin {
  const lock = loadContractLock(root);
  const catalogDigest = verifyComponentChecksums(join(root, lock.vendorRoots.catalog));
  const adapterDigest = verifyComponentChecksums(join(root, lock.vendorRoots.acpAdapter));
  const frontendDigest = verifyComponentChecksums(join(root, lock.vendorRoots.frontend));
  const remoteSums = readFileSync(join(root, lock.vendorRoots.remoteAgent, "SHA256SUMS"));
  const remoteMats = digestMaterializations(remoteSums);

  if (catalogDigest !== lock.components.remoteExpertCatalog.consumerDigest) {
    throw new RemoteExpertError("ACP_CONTRACT_INCOMPATIBLE", "catalog digest mismatch");
  }
  if (adapterDigest !== lock.components.acpAdapter.consumerDigest) {
    throw new RemoteExpertError("ACP_CONTRACT_INCOMPATIBLE", "adapter digest mismatch");
  }
  if (
    remoteMats.raw !== lock.components.remoteAgent.consumerDigest &&
    remoteMats.crlf !== lock.components.remoteAgent.consumerDigest &&
    remoteMats.lf !== lock.components.remoteAgent.consumerDigest
  ) {
    throw new RemoteExpertError("ACP_CONTRACT_INCOMPATIBLE", "remote-agent digest mismatch");
  }
  if (
    remoteMats.lf !== lock.components.remoteAgent.consumerDigestLfMaterialization &&
    remoteMats.raw !== lock.components.remoteAgent.consumerDigestLfMaterialization
  ) {
    throw new RemoteExpertError(
      "ACP_CONTRACT_INCOMPATIBLE",
      "remote-agent LF digest mismatch",
    );
  }

  const frontendSums = readFileSync(join(root, lock.vendorRoots.frontend, "SHA256SUMS"), "utf8");
  const bundle = bundleDigestFromChecksumText(frontendSums);
  if (bundle !== lock.bundleDigest) {
    throw new RemoteExpertError("ACP_CONTRACT_INCOMPATIBLE", "bundleDigest mismatch");
  }
  if (lock.protocolVersion !== 1) {
    throw new RemoteExpertError("ACP_CONTRACT_INCOMPATIBLE", "protocolVersion mismatch");
  }
  void frontendDigest;
  return { lock, root };
}
