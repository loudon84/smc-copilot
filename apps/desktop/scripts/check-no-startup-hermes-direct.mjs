#!/usr/bin/env node
/**
 * PRD v1.3.1 — startup path must not probe Hermes Gateway or run install directly.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "src");
const TARGETS = [
  "renderer/src/App.tsx",
  "renderer/src/hooks/useStartupGate.ts",
  "main/startup",
];

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const BANNED = [
  /\bverifyInstall\s*\(/,
  /\bcheckInstall\s*\(/,
  /\bstartInstall\s*\(/,
  /\btestRemoteConnection\s*\(/,
  /\bstartGateway\s*\(/,
  /\brunInstall\s*\(/,
  /\bgetConnectionConfig\s*\(/,
  /\bstartSshTunnel\s*\(/,
];

function collectFiles(relPath) {
  const full = join(ROOT, relPath);
  if (!statSync(full).isDirectory()) return [full];
  const out = [];
  for (const name of readdirSync(full)) {
    const child = join(full, name);
    if (statSync(child).isDirectory()) out.push(...collectFiles(relative(ROOT, child)));
    else if (/\.(ts|tsx)$/.test(name)) out.push(child);
  }
  return out;
}

const violations = [];
for (const target of TARGETS) {
  for (const file of collectFiles(target)) {
    const rel = relative(join(process.cwd(), "src"), file).replace(/\\/g, "/");
    const text = stripComments(readFileSync(file, "utf8"));
    for (const pattern of BANNED) {
      if (pattern.test(text)) {
        violations.push(`${rel} matches ${pattern}`);
      }
    }
  }
}

if (violations.length) {
  console.error("[check:no-startup-hermes-direct] violations:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}

console.log("[check:no-startup-hermes-direct] ok");
