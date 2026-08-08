#!/usr/bin/env node
/**
 * PRD v1.3.1 — startup modules must not read ~/.hermes for routing decisions.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const STARTUP_DIR = join(process.cwd(), "src/main/startup");
const APP_FILES = [
  join(process.cwd(), "src/renderer/src/App.tsx"),
  join(process.cwd(), "src/renderer/src/hooks/useStartupGate.ts"),
];

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const BANNED = [
  /\bHERMES_HOME\b/,
  /\bgetConnectionConfig\s*\(/,
  /\bgetHermesHome\s*\(/,
  /readFileSync\([^)]*desktop\.json/,
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const violations = [];
for (const file of [...walk(STARTUP_DIR), ...APP_FILES]) {
  const rel = relative(process.cwd(), file).replace(/\\/g, "/");
  const text = stripComments(readFileSync(file, "utf8"));
  for (const pattern of BANNED) {
    if (pattern.test(text)) {
      violations.push(`${rel} matches ${pattern}`);
    }
  }
}

if (violations.length) {
  console.error("[check:no-startup-hermes-home] violations:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}

console.log("[check:no-startup-hermes-home] ok");
