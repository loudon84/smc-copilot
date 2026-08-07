import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "fs";
import { dirname, join, basename } from "path";

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function writeTextFile(filePath: string, content: string): void {
  ensureDir(dirname(filePath));
  writeFileSync(filePath, content, "utf-8");
}

export function copySourceMarkdown(sourcePath: string, destPath: string): void {
  ensureDir(dirname(destPath));
  copyFileSync(sourcePath, destPath);
}

export function roleSourceDestDir(profileHome: string): string {
  return join(profileHome, "skills", "role-source", "agency-agents-zh");
}

/** Preserves repo-relative path under skills/role-source/agency-agents-zh/ */
export function destPathForSource(profileHome: string, sourceRelativePath: string): string {
  const normalized = sourceRelativePath.replace(/\\/g, "/");
  return join(roleSourceDestDir(profileHome), normalized);
}

export function roleSourceSkillRelPath(sourceRelativePath: string): string {
  const normalized = sourceRelativePath.replace(/\\/g, "/");
  return join("skills", "role-source", "agency-agents-zh", normalized).replace(/\\/g, "/");
}
