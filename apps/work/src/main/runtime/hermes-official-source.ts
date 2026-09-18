/**
 * Write Hermes Root official-source.json (PRD §9.3) — atomic tempfile+rename.
 */
import { mkdirSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type { HermesReleaseSource } from "./hermes-release-source";
import { repositoryIdentity } from "./hermes-release-source";

export interface OfficialSourceDocument {
  schemaVersion: 1;
  repositoryIdentity: string;
  installUrl: string;
  originUrls: {
    http: string | null;
    https: string | null;
    ssh: string | null;
  };
  defaultBranch: string;
  approvedCommitAtInstall: string;
  writtenAt: string;
}

export function buildOfficialSourceDocument(
  source: HermesReleaseSource,
  writtenAt = new Date().toISOString(),
): OfficialSourceDocument {
  const installUrl = source.installUrl.replace(/\/\/[^/@]+@/, "//");
  return {
    schemaVersion: 1,
    repositoryIdentity:
      source.repositoryIdentity || repositoryIdentity(installUrl),
    installUrl,
    originUrls: {
      http: source.originUrls?.http ?? null,
      https: source.originUrls?.https ?? null,
      ssh: source.originUrls?.ssh ?? null,
    },
    defaultBranch: source.defaultBranch,
    approvedCommitAtInstall: source.approvedCommit,
    writtenAt,
  };
}

export function writeOfficialSourceJson(
  hermesRoot: string,
  source: HermesReleaseSource,
): string {
  const path = join(hermesRoot, "official-source.json");
  const doc = buildOfficialSourceDocument(source);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, "utf-8");
  renameSync(tmp, path);
  return path;
}
