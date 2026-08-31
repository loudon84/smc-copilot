#!/usr/bin/env node
/**
 * Fail if a git change adds/modifies both English and non-English i18n locale packages.
 *
 * Feature implementation may only create English packages. Other languages are
 * translated later by an administrator after English review.
 *
 * Keep classifyLocalePackageChanges aligned with
 * src/shared/i18n/source-locale-authoring.ts.
 */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SOURCE_LOCALE_ID = "en";
const LOCALES_RE = /(?:^|\/)src\/shared\/i18n\/locales\/([^/]+)\//;

const workRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @param {string} filePath
 * @returns {string | null}
 */
export function localeIdFromPath(filePath) {
  const normalized = String(filePath).replace(/\\/g, "/");
  const match = normalized.match(LOCALES_RE);
  return match ? match[1] : null;
}

/**
 * @param {string[]} filePaths
 * @returns {{ sourceFiles: string[], otherFiles: string[] }}
 */
export function classifyLocalePackageChanges(filePaths) {
  const sourceFiles = [];
  const otherFiles = [];
  for (const filePath of filePaths) {
    const locale = localeIdFromPath(filePath);
    if (!locale) continue;
    if (locale === SOURCE_LOCALE_ID) sourceFiles.push(filePath);
    else otherFiles.push(filePath);
  }
  return { sourceFiles, otherFiles };
}

/**
 * @param {{ sourceFiles: string[], otherFiles: string[] }} classified
 * @returns {string | null}
 */
export function simultaneousLocaleCreationMessage(classified) {
  if (classified.sourceFiles.length === 0 || classified.otherFiles.length === 0) {
    return null;
  }
  return [
    "i18n source-locale-only: feature changes may edit locales/en only.",
    "Non-English locale packages must be translated later by an administrator.",
    `English: ${classified.sourceFiles.join(", ")}`,
    `Other: ${classified.otherFiles.join(", ")}`,
  ].join("\n");
}

/**
 * @param {string} cwd
 * @param {string[]} args
 * @returns {string}
 */
function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/**
 * Collect add/modify paths in the working tree and the latest commit.
 * Branch history is not scanned so already-landed mixed locale files stay grandfathered.
 *
 * @param {string} [cwd]
 * @returns {string[]}
 */
export function collectChangedFiles(cwd = workRoot) {
  const repoRoot = git(cwd, ["rev-parse", "--show-toplevel"]);
  const files = new Set();
  const add = (output) => {
    for (const line of output.split(/\r?\n/)) {
      const path = line.trim().replace(/\\/g, "/");
      if (path) files.add(path);
    }
  };
  const nameOnly = ["diff", "--name-only", "--diff-filter=ACMR"];
  add(git(repoRoot, [...nameOnly, "HEAD"]));
  add(git(repoRoot, ["ls-files", "--others", "--exclude-standard"]));
  try {
    add(git(repoRoot, [...nameOnly, "HEAD~1", "HEAD"]));
  } catch {
    // first commit or shallow clone without HEAD~1
  }
  return [...files];
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return pathToFileURL(resolve(entry)).href === import.meta.url;
}

if (isDirectRun()) {
  const files = collectChangedFiles(workRoot);
  const message = simultaneousLocaleCreationMessage(
    classifyLocalePackageChanges(files),
  );
  if (message) {
    console.error(message);
    process.exit(1);
  }
  console.log(
    "OK: i18n locale packages are not created simultaneously with English source",
  );
}
