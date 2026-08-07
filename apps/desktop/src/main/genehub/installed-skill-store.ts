import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import type { InstalledSkillRecord } from "../../shared/genehub/genehub-contract";

function installedDir(hermesHome: string): string {
  return join(hermesHome, "genehub", "installed");
}

export function listInstalledSkillRecords(hermesHome: string): InstalledSkillRecord[] {
  const dir = installedDir(hermesHome);
  if (!existsSync(dir)) return [];
  const records: InstalledSkillRecord[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(readFileSync(join(dir, file), "utf-8")) as InstalledSkillRecord;
      records.push(raw);
    } catch {
      /* skip */
    }
  }
  return records;
}

export function readInstalledSkillRecord(
  hermesHome: string,
  geneSlug: string,
): InstalledSkillRecord | null {
  const path = join(installedDir(hermesHome), `${geneSlug}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as InstalledSkillRecord;
  } catch {
    return null;
  }
}

export function writeInstalledSkillRecord(
  hermesHome: string,
  record: InstalledSkillRecord,
): void {
  const dir = installedDir(hermesHome);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${record.geneSlug}.json`), JSON.stringify(record, null, 2), "utf-8");
}

export function removeInstalledSkillRecord(hermesHome: string, geneSlug: string): void {
  const path = join(installedDir(hermesHome), `${geneSlug}.json`);
  if (existsSync(path)) {
    rmSync(path, { force: true });
  }
}
