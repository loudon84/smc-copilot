#!/usr/bin/env node
/**
 * Rewrite imports in copied Chat / File Platform trees.
 * - shared/files → @shared/chat-files (and relative variants)
 * - reports package import candidates
 */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const map = JSON.parse(readFileSync(join(__dirname, "chat-copy-map.json"), "utf8"));

const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

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
    const lower = name.toLowerCase();
    const dot = lower.lastIndexOf(".");
    const ext = dot >= 0 ? lower.slice(dot) : "";
    if (CODE_EXT.has(ext)) out.push(full);
  }
}

/**
 * @param {string} text
 * @returns {string}
 */
function rewriteText(text) {
  let next = text;
  next = next.replace(
    /from\s+["']((?:\.\.\/)+)shared\/files(\/[^"']*)?["']/g,
    (_m, _dots, sub = "") => `from "@shared/chat-files${sub || ""}"`,
  );
  next = next.replace(
    /from\s+["']@shared\/files(\/[^"']*)?["']/g,
    (_m, sub = "") => `from "@shared/chat-files${sub || ""}"`,
  );
  next = next.replace(
    /from\s+["']\.\.\/\.\.\/components\/files(\/[^"']*)?["']/g,
    (_m, sub = "") => `from "../components/files${sub || ""}"`,
  );
  next = next.replace(
    /from\s+["']\.\.\/\.\.\/hooks\/files(\/[^"']*)?["']/g,
    (_m, sub = "") => `from "../hooks/files${sub || ""}"`,
  );
  next = next.replace(/from\s+["'][^"']*references\/[^"']*["']/g, 'from "__FORBIDDEN_REFERENCE__"');
  return next;
}

const targets = map.copies.map((c) => join(ROOT, c.to));
/** @type {string[]} */
const files = [];
for (const t of targets) walk(t, files);

let changed = 0;
/** @type {Set<string>} */
const packageImports = new Set();

for (const f of files) {
  const before = readFileSync(f, "utf8");
  const after = rewriteText(before);
  if (after !== before) {
    writeFileSync(f, after, "utf8");
    changed += 1;
  }
  const re = /from\s+["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(after)) !== null) {
    const spec = m[1];
    if (spec.startsWith(".") || spec.startsWith("@/") || spec.startsWith("@shared/")) continue;
    if (spec.startsWith("@renderer") || spec.startsWith("@main")) continue;
    const pkg = spec.startsWith("@")
      ? spec.split("/").slice(0, 2).join("/")
      : spec.split("/")[0];
    packageImports.add(pkg);
  }
}

const report = {
  filesScanned: files.length,
  filesRewritten: changed,
  packageImportCandidates: [...packageImports].sort(),
};
writeFileSync(join(__dirname, "rewrite-report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(`Rewrote ${changed}/${files.length} files`);
console.log(`Package import candidates (${report.packageImportCandidates.length}):`);
for (const p of report.packageImportCandidates) console.log(`  - ${p}`);
console.log(`Report: scripts/chat-migration/rewrite-report.json`);
