import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { GeneHubError } from "../../shared/genehub/genehub-errors";

export interface ScriptProvenanceRecord {
  source: "nodeskclaw-genehub";
  jobId: string;
  geneSlug: string;
  geneVersion?: string;
  installedAt: string;
}

const PROVENANCE_SUFFIX = ".genehub.json";

export function scriptProvenanceSidecarPath(scriptFullPath: string): string {
  return `${scriptFullPath}${PROVENANCE_SUFFIX}`;
}

export function readScriptProvenance(scriptFullPath: string): ScriptProvenanceRecord | null {
  const sidecar = scriptProvenanceSidecarPath(scriptFullPath);
  if (!existsSync(sidecar)) return null;
  try {
    return JSON.parse(readFileSync(sidecar, "utf-8")) as ScriptProvenanceRecord;
  } catch {
    return null;
  }
}

export function writeScriptProvenance(
  scriptFullPath: string,
  record: ScriptProvenanceRecord,
): void {
  const sidecar = scriptProvenanceSidecarPath(scriptFullPath);
  mkdirSync(dirname(sidecar), { recursive: true });
  writeFileSync(sidecar, JSON.stringify(record, null, 2), "utf-8");
}

export function assertScriptProvenanceAllowed(input: {
  scriptFullPath: string;
  geneSlug: string;
  jobId: string;
}): void {
  const { scriptFullPath, geneSlug, jobId } = input;
  if (!existsSync(scriptFullPath)) return;

  const provenance = readScriptProvenance(scriptFullPath);
  if (!provenance) {
    throw new GeneHubError(
      "GENEHUB_SCRIPT_OVERWRITE_BLOCKED",
      `Script exists without GeneHub provenance: ${scriptFullPath}`,
    );
  }

  if (provenance.geneSlug !== geneSlug && provenance.jobId !== jobId) {
    throw new GeneHubError(
      "GENEHUB_SCRIPT_PROVENANCE_MISMATCH",
      `Script provenance mismatch for: ${scriptFullPath}`,
    );
  }
}

export function backupScriptFile(scriptFullPath: string, hermesHome: string): string | null {
  if (!existsSync(scriptFullPath)) return null;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rel = scriptFullPath.replace(hermesHome, "").replace(/^[/\\]/, "");
  const backupPath = join(hermesHome, "genehub", "backup", "scripts", timestamp, rel);
  mkdirSync(dirname(backupPath), { recursive: true });
  cpSync(scriptFullPath, backupPath);
  const sidecar = scriptProvenanceSidecarPath(scriptFullPath);
  if (existsSync(sidecar)) {
    cpSync(sidecar, scriptProvenanceSidecarPath(backupPath));
  }
  return backupPath;
}
