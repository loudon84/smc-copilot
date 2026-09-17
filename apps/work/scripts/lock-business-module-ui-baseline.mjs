#!/usr/bin/env node
/**
 * Lock / verify protected Hermes UI digest for Knowledge UI Kit release.
 * Usage:
 *   node scripts/lock-business-module-ui-baseline.mjs lock
 *   node scripts/lock-business-module-ui-baseline.mjs verify
 */
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = join(
  root,
  "scripts",
  "fixtures",
  "work-knowledge-ui-v2-baseline-lock.json",
);
const componentsDir = join(root, "src/renderer/src/components");
const mainCss = join(root, "src/renderer/src/assets/main.css");
const constantsFile = join(root, "src/renderer/src/constants.ts");

function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

function walkFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkFiles(full));
    } else {
      out.push(full);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function treeDigest(dir) {
  const h = createHash("sha256");
  const files = walkFiles(dir);
  for (const full of files) {
    const rel = relative(dir, full).replace(/\\/g, "/");
    h.update(rel);
    h.update("\0");
    h.update(sha256File(full));
    h.update("\n");
  }
  return { digest: h.digest("hex"), fileCount: files.length };
}

function themeIds() {
  const text = readFileSync(constantsFile, "utf8");
  const block = text.match(/export const THEMES: ThemeDef\[] = \[([\s\S]*?)\];/);
  if (!block) {
    throw new Error("THEMES registry not found in constants.ts");
  }
  return [...block[1].matchAll(/id:\s*"([^"]+)"/g)].map((m) => m[1]);
}

function snapshot() {
  const tree = treeDigest(componentsDir);
  return {
    components_tree_sha256: tree.digest,
    components_file_count: tree.fileCount,
    main_css_sha256: sha256File(mainCss),
    themes_ids: themeIds(),
  };
}

const mode = process.argv[2] ?? "verify";
const current = snapshot();

if (mode === "lock") {
  mkdirSync(dirname(lockPath), { recursive: true });
  writeFileSync(lockPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  console.log(`[baseline-lock] wrote ${relative(root, lockPath).replace(/\\/g, "/")}`);
  console.log(JSON.stringify(current, null, 2));
  process.exit(0);
}

const locked = JSON.parse(readFileSync(lockPath, "utf8"));
const mismatches = [];
for (const key of [
  "components_tree_sha256",
  "components_file_count",
  "main_css_sha256",
]) {
  if (locked[key] !== current[key]) {
    mismatches.push(`${key}: locked=${locked[key]} actual=${current[key]}`);
  }
}
const lockedThemes = JSON.stringify(locked.themes_ids);
const currentThemes = JSON.stringify(current.themes_ids);
if (lockedThemes !== currentThemes) {
  mismatches.push(`themes_ids: locked=${lockedThemes} actual=${currentThemes}`);
}
if (mismatches.length > 0) {
  console.error("[baseline-lock] PROTECTED DIGEST MISMATCH");
  for (const line of mismatches) console.error(`  ${line}`);
  process.exit(1);
}
console.log("[baseline-lock] OK protected digest unchanged");
