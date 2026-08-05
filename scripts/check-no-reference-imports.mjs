#!/usr/bin/env node
/**
 * PRD v8.0 §10: product `src/` must never import from `references/**`.
 * Fails CI if references/ appears under src/.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const FORBIDDEN = [/references\//i];
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

/** @type {string[]} */
const hits = [];

/**
 * @param {string} dir
 */
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    const lower = name.toLowerCase();
    const dot = lower.lastIndexOf(".");
    const ext = dot >= 0 ? lower.slice(dot) : "";
    if (!CODE_EXT.has(ext)) continue;
    const text = readFileSync(full, "utf8");
    for (const re of FORBIDDEN) {
      if (re.test(text)) {
        hits.push(relative(ROOT, full).replace(/\\/g, "/"));
        break;
      }
    }
  }
}

walk(SRC);

if (hits.length > 0) {
  console.error(
    "Forbidden references/ imports found under src/:\n" +
      hits.map((h) => `  - ${h}`).join("\n"),
  );
  process.exit(1);
}

console.log("OK: no references/ imports under src/");
