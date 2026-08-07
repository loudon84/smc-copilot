#!/usr/bin/env node
/**
 * Scaffold (not CI-blocking until Phase 8): Main must not import ./hermes outside legacy.
 * Currently reports only — exit 0 unless COPILOT_ENFORCE_NO_DIRECT_HERMES=1.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const MAIN = join(ROOT, "src/main");
const ALLOW = new Set([
  "hermes.ts",
  "hermes-local-adapter.ts",
  "hermes-model-env.ts",
]);

/**
 * @param {string} dir
 * @param {string[]} out
 */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "legacy-hermes-direct" || name === "node_modules") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.ts$/.test(name) && !ALLOW.has(name)) out.push(full);
  }
  return out;
}

const pattern =
  /from\s+["'](\.\.\/)*hermes["']|from\s+["']\.\/hermes["']|require\(["']\.\/hermes["']\)/;
const violations = [];
for (const file of walk(MAIN)) {
  const text = readFileSync(file, "utf8");
  if (
    pattern.test(text) &&
    !file.includes("hermes-default-chat") &&
    !file.includes("hermes-experts") &&
    !file.includes("hermes-config") &&
    !file.includes("hermes-mcp")
  ) {
    violations.push(relative(ROOT, file));
  }
}

if (violations.length) {
  console.warn(
    `[check:no-direct-hermes] ${violations.length} files still import hermes (scaffold; Phase 8 enforces)`,
  );
  if (process.env.COPILOT_ENFORCE_NO_DIRECT_HERMES === "1") {
    for (const v of violations.slice(0, 50)) console.error(" -", v);
    process.exit(1);
  }
} else {
  console.log("[check:no-direct-hermes] ok");
}
