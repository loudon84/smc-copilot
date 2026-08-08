#!/usr/bin/env node
/**
 * PRD v1.4 — Desktop Memory / Session Catalog must not read Hermes files or state.db.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const violations = [];

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const memoryPath = join(ROOT, "src/main/memory.ts");
if (existsSync(memoryPath)) {
  const text = stripComments(readFileSync(memoryPath, "utf8"));
  for (const needle of ["MEMORY.md", "state.db", "better-sqlite3", "USER.md"]) {
    if (text.includes(needle)) {
      violations.push(`src/main/memory.ts contains forbidden ${needle}`);
    }
  }
  if (/\breadFileSync\s*\(/.test(text) && /memor/i.test(text)) {
    violations.push("src/main/memory.ts uses readFileSync for memories");
  }
}

const catalogReader = join(
  ROOT,
  "src/main/session-catalog/session-catalog-profile-reader.ts",
);
if (existsSync(catalogReader)) {
  const text = stripComments(readFileSync(catalogReader, "utf8"));
  if (/\bbetter-sqlite3\b/.test(text) || /from\s+["']better-sqlite3["']/.test(text)) {
    violations.push(
      "src/main/session-catalog/session-catalog-profile-reader.ts imports better-sqlite3",
    );
  }
}

if (violations.length) {
  console.error("[check:no-desktop-hermes-data] violations:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}

console.log("[check:no-desktop-hermes-data] ok");
