#!/usr/bin/env node
/**
 * PRD v1.5 §89 — Desktop Thin Client paths must not probe Hermes Gateway
 * `:8642/health` or `:8642/v1/models` for readiness.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const WATCH = [
  "src/renderer/src/screens/SettingsDrawer",
  "src/renderer/src/modules/hermes-runtime",
  "src/renderer/src/hooks/useStartupGate.ts",
  "src/main/startup",
  "src/main/copilot-runtime-client",
  "src/main/runtime-adapters",
  "src/preload/copilot-runtime-api.ts",
];

const BANNED = [/:8642\/health/, /:8642\/v1\/models/, /fetch\([^)]*8642[^)]*health/];

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

const violations = [];
for (const rel of WATCH) {
  const full = join(ROOT, rel);
  let files = [];
  try {
    const st = statSync(full);
    files = st.isDirectory() ? walk(full) : [full];
  } catch {
    continue;
  }
  for (const file of files) {
    const text = stripComments(readFileSync(file, "utf8"));
    for (const re of BANNED) {
      if (re.test(text)) {
        violations.push(`${relative(ROOT, file).replace(/\\/g, "/")} :: ${re}`);
      }
    }
  }
}

if (violations.length) {
  console.error("check:no-desktop-gateway-health FAILED:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}
console.log("check:no-desktop-gateway-health OK");
