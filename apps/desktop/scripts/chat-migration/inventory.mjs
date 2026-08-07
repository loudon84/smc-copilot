#!/usr/bin/env node
/**
 * Inventory source Chat / File Platform trees from chat-copy-map.json.
 * Prints file counts and exclude matches; does not copy.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

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

const sourceRoot = join(ROOT, map.sourceRoot);
console.log(`sourceRoot: ${map.sourceRoot}`);
console.log(`exists: ${existsSync(sourceRoot)}`);

let total = 0;
let excluded = 0;

for (const entry of map.copies) {
  const fromAbs = join(sourceRoot, entry.from);
  /** @type {string[]} */
  const files = [];
  walk(fromAbs, files);
  const kept = [];
  const skipped = [];
  for (const f of files) {
    const rel = relative(fromAbs, f).replace(/\\/g, "/");
    const fullRel = relative(ROOT, f).replace(/\\/g, "/");
    if (excludeMatchers.some((m) => m(rel) || m(fullRel) || m(f.replace(/\\/g, "/")))) {
      skipped.push(rel);
      excluded += 1;
      continue;
    }
    kept.push(rel);
    total += 1;
  }
  console.log(`\n[${entry.from}] → [${entry.to}]`);
  console.log(`  description: ${entry.description || ""}`);
  console.log(`  keep: ${kept.length}, exclude: ${skipped.length}`);
  if (skipped.length > 0) {
    console.log(`  excluded: ${skipped.slice(0, 10).join(", ")}${skipped.length > 10 ? "…" : ""}`);
  }
}

console.log(`\nTotal files to copy: ${total} (excluded ${excluded})`);
