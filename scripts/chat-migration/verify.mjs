#!/usr/bin/env node
/**
 * Verify chat migration boundaries:
 * 1. No references/ imports under src/
 * 2. Copied trees exist per chat-copy-map.json
 * 3. Excluded files are absent
 * 4. Emit verification report
 */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const map = JSON.parse(readFileSync(join(__dirname, "chat-copy-map.json"), "utf8"));

const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

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

/** @type {string[]} */
const failures = [];
/** @type {string[]} */
const warnings = [];

// 1. references imports under src/
const srcDir = join(ROOT, "src");
/** @type {string[]} */
const srcFiles = [];
walk(srcDir, srcFiles);
const refHits = [];
for (const f of srcFiles) {
  const lower = f.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";
  if (!CODE_EXT.has(ext)) continue;
  const text = readFileSync(f, "utf8");
  if (/references\//i.test(text)) {
    refHits.push(relative(ROOT, f).replace(/\\/g, "/"));
  }
}
if (refHits.length > 0) {
  failures.push(`Forbidden references/ imports:\n${refHits.map((h) => `  - ${h}`).join("\n")}`);
}

// 2. target trees must exist (after copy) — warn if missing (phase 0 may run before copy)
for (const entry of map.copies) {
  const toAbs = join(ROOT, entry.to);
  if (!existsSync(toAbs)) {
    warnings.push(`Target not yet copied: ${entry.to}`);
  }
}

// 3. excluded basenames must not appear under module targets
const excludeMatchers = (map.excludes || []).map(globToMatcher);
for (const entry of map.copies) {
  const toAbs = join(ROOT, entry.to);
  if (!existsSync(toAbs)) continue;
  /** @type {string[]} */
  const files = [];
  walk(toAbs, files);
  for (const f of files) {
    const rel = relative(toAbs, f).replace(/\\/g, "/");
    if (excludeMatchers.some((m) => m(rel) || m(relative(ROOT, f).replace(/\\/g, "/")))) {
      failures.push(`Excluded file present: ${relative(ROOT, f).replace(/\\/g, "/")}`);
    }
  }
}

const report = {
  ok: failures.length === 0,
  failures,
  warnings,
  checkedAt: new Date().toISOString(),
};
writeFileSync(join(__dirname, "verify-report.json"), JSON.stringify(report, null, 2), "utf8");

if (warnings.length > 0) {
  console.log("Warnings:");
  for (const w of warnings) console.log(`  - ${w}`);
}

if (failures.length > 0) {
  console.error("FAIL: chat boundary verification");
  for (const f of failures) console.error(f);
  process.exit(1);
}

console.log("OK: chat boundaries verified");
console.log("Report: scripts/chat-migration/verify-report.json");
