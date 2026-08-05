#!/usr/bin/env node
/**
 * Copy mapped trees from references/copilot-desktop into src/.
 * Skips excludes from chat-copy-map.json. Writes migration-manifest.json.
 */
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  statSync,
  existsSync,
  mkdirSync,
  copyFileSync,
} from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const map = JSON.parse(readFileSync(join(__dirname, "chat-copy-map.json"), "utf8"));

/**
 * @param {string} pattern
 * @returns {(path: string) => boolean}
 */
function globToMatcher(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "§§")
    .replace(/\*/g, "[^/\\\\]*")
    .replace(/§§/g, ".*");
  const re = new RegExp(`^${escaped}$`, "i");
  return (p) => re.test(p.replace(/\\/g, "/"));
}

const excludeMatchers = (map.excludes || []).map(globToMatcher);

/**
 * @param {string} dir
 * @param {string[]} out
 */
function walk(dir, out) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
      continue;
    }
    out.push(full);
  }
}

/**
 * @param {string} filePath
 * @param {string} fromAbs
 */
function isExcluded(filePath, fromAbs) {
  const rel = relative(fromAbs, filePath).replace(/\\/g, "/");
  const fullRel = relative(ROOT, filePath).replace(/\\/g, "/");
  const base = filePath.replace(/\\/g, "/");
  return excludeMatchers.some((m) => m(rel) || m(fullRel) || m(base));
}

const sourceRoot = join(ROOT, map.sourceRoot);
if (!existsSync(sourceRoot)) {
  console.error(`Source root missing: ${map.sourceRoot}`);
  process.exit(1);
}

/** @type {{ copied: Array<{from: string, to: string}>, skipped: string[], errors: string[] }} */
const manifest = { copied: [], skipped: [], errors: [] };

for (const entry of map.copies) {
  const fromAbs = join(sourceRoot, entry.from);
  const toAbs = join(ROOT, entry.to);
  if (!existsSync(fromAbs)) {
    manifest.errors.push(`missing source: ${entry.from}`);
    console.error(`Missing: ${entry.from}`);
    continue;
  }
  /** @type {string[]} */
  const files = [];
  walk(fromAbs, files);
  for (const f of files) {
    const rel = relative(fromAbs, f);
    if (isExcluded(f, fromAbs)) {
      manifest.skipped.push(relative(ROOT, f).replace(/\\/g, "/"));
      continue;
    }
    const dest = join(toAbs, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(f, dest);
    manifest.copied.push({
      from: relative(ROOT, f).replace(/\\/g, "/"),
      to: relative(ROOT, dest).replace(/\\/g, "/"),
    });
  }
  console.log(`Copied ${entry.from} → ${entry.to}`);
}

const manifestPath = join(__dirname, "migration-manifest.json");
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
console.log(
  `\nCopied ${manifest.copied.length}, skipped ${manifest.skipped.length}, errors ${manifest.errors.length}`,
);
console.log(`Manifest: scripts/chat-migration/migration-manifest.json`);

if (manifest.errors.length > 0) process.exit(1);
