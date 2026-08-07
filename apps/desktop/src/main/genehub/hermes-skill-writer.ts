import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
  cpSync,
} from "fs";
import { dirname, join, resolve } from "path";
import type { GeneHubBundle, InstalledSkillRecord } from "../../shared/genehub/genehub-contract";
import { GeneHubError } from "../../shared/genehub/genehub-errors";
import { assertSafeRelativePath, assertValidSkillName } from "./skill-package-validator";
import { writeInstalledSkillRecord, removeInstalledSkillRecord } from "./installed-skill-store";
import {
  assertScriptProvenanceAllowed,
  backupScriptFile,
  writeScriptProvenance,
} from "./script-provenance";

const SNAPSHOT_FILE = ".skills_prompt_snapshot.json";

function decodeContent(content: string, encoding: "utf-8" | "base64" = "utf-8"): Buffer | string {
  if (encoding === "base64") {
    return Buffer.from(content, "base64");
  }
  return content;
}

function writeFileEnsuringDir(filePath: string, data: Buffer | string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  if (Buffer.isBuffer(data)) {
    writeFileSync(filePath, data);
  } else {
    writeFileSync(filePath, data, "utf-8");
  }
}

function backupSkillDir(hermesHome: string, skillName: string): string | null {
  const skillDir = join(hermesHome, "skills", skillName);
  if (!existsSync(skillDir)) return null;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = join(hermesHome, "genehub", "backup", skillName, timestamp);
  mkdirSync(dirname(backupDir), { recursive: true });
  cpSync(skillDir, backupDir, { recursive: true });
  return backupDir;
}

function rollbackFromBackup(hermesHome: string, skillName: string, backupDir: string | null): void {
  if (!backupDir || !existsSync(backupDir)) return;
  const skillDir = join(hermesHome, "skills", skillName);
  if (existsSync(skillDir)) {
    rmSync(skillDir, { recursive: true, force: true });
  }
  mkdirSync(dirname(skillDir), { recursive: true });
  cpSync(backupDir, skillDir, { recursive: true });
}

export function cleanSkillSnapshot(hermesHome: string): void {
  const snapshotPath = join(hermesHome, SNAPSHOT_FILE);
  if (existsSync(snapshotPath)) {
    try {
      rmSync(snapshotPath, { force: true });
    } catch (err) {
      throw new GeneHubError(
        "HERMES_SNAPSHOT_CLEAN_FAILED",
        err instanceof Error ? err.message : "Failed to clean snapshot",
      );
    }
  }
}

export async function installGeneHubBundle(input: {
  hermesHome: string;
  profileName: string;
  jobId: string;
  bundle: GeneHubBundle;
}): Promise<InstalledSkillRecord> {
  const { hermesHome, profileName, jobId, bundle } = input;
  const skillName = bundle.manifest.skillName;
  assertValidSkillName(skillName);

  const tempDir = join(hermesHome, "genehub", "tmp", jobId);
  const skillDir = join(hermesHome, "skills", skillName);
  const scriptsDir = join(hermesHome, "scripts");
  const backupDir = backupSkillDir(hermesHome, skillName);

  try {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    mkdirSync(tempDir, { recursive: true });

    for (const file of bundle.files) {
      const safePath = assertSafeRelativePath(file.relativePath, hermesHome);
      const target = join(tempDir, safePath);
      writeFileEnsuringDir(target, decodeContent(file.content, file.encoding));
    }

    if (existsSync(skillDir)) {
      rmSync(skillDir, { recursive: true, force: true });
    }
    mkdirSync(dirname(skillDir), { recursive: true });
    renameSync(tempDir, skillDir);

    for (const script of bundle.scripts ?? []) {
      const safePath = assertSafeRelativePath(script.relativePath, hermesHome);
      const target = join(scriptsDir, safePath);
      assertScriptProvenanceAllowed({
        scriptFullPath: target,
        geneSlug: bundle.manifest.geneSlug,
        jobId,
      });
      backupScriptFile(target, hermesHome);
      writeFileEnsuringDir(target, decodeContent(script.content, script.encoding));
      writeScriptProvenance(target, {
        source: "nodeskclaw-genehub",
        jobId,
        geneSlug: bundle.manifest.geneSlug,
        geneVersion: bundle.manifest.geneVersion,
        installedAt: new Date().toISOString(),
      });
    }

    cleanSkillSnapshot(hermesHome);

    const provenance = {
      source: "nodeskclaw-genehub",
      jobId,
      geneSlug: bundle.manifest.geneSlug,
      geneVersion: bundle.manifest.geneVersion,
      skillName,
      installedAt: new Date().toISOString(),
      profileName,
    };
    writeFileEnsuringDir(
      join(skillDir, "genehub.json"),
      JSON.stringify(provenance, null, 2),
    );

    const record: InstalledSkillRecord = {
      geneSlug: bundle.manifest.geneSlug,
      geneVersion: bundle.manifest.geneVersion,
      skillName,
      installedAt: new Date().toISOString(),
      source: "nodeskclaw-genehub",
      jobId,
      profileName,
    };
    writeInstalledSkillRecord(hermesHome, record);
    return record;
  } catch (err) {
    try {
      rollbackFromBackup(hermesHome, skillName, backupDir);
    } catch (rollbackErr) {
      throw new GeneHubError(
        "INSTALL_ROLLBACK_FAILED",
        rollbackErr instanceof Error ? rollbackErr.message : "Rollback failed",
      );
    }

    if (err instanceof GeneHubError) throw err;
    throw new GeneHubError(
      "HERMES_SKILL_WRITE_FAILED",
      err instanceof Error ? err.message : "Failed to write skill",
    );
  } finally {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

export async function uninstallGeneHubSkill(input: {
  hermesHome: string;
  skillName: string;
  geneSlug: string;
  managedScriptPaths?: string[];
}): Promise<void> {
  const { hermesHome, skillName, geneSlug, managedScriptPaths } = input;
  assertValidSkillName(skillName);

  const skillDir = join(hermesHome, "skills", skillName);
  const backupDir = backupSkillDir(hermesHome, skillName);

  try {
    if (existsSync(skillDir)) {
      rmSync(skillDir, { recursive: true, force: true });
    }

    for (const scriptPath of managedScriptPaths ?? []) {
      const safe = assertSafeRelativePath(scriptPath, hermesHome);
      const full = resolve(hermesHome, "scripts", safe);
      const scriptsRoot = resolve(hermesHome, "scripts");
      if (full.startsWith(scriptsRoot) && existsSync(full)) {
        rmSync(full, { force: true });
      }
    }

    cleanSkillSnapshot(hermesHome);
    removeInstalledSkillRecord(hermesHome, geneSlug);
  } catch (err) {
    rollbackFromBackup(hermesHome, skillName, backupDir);
    if (err instanceof GeneHubError) throw err;
    throw new GeneHubError(
      "HERMES_SKILL_WRITE_FAILED",
      err instanceof Error ? err.message : "Failed to uninstall skill",
    );
  }
}

export function listLocalSkillNames(hermesHome: string): string[] {
  const skillsRoot = join(hermesHome, "skills");
  if (!existsSync(skillsRoot)) return [];
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}
