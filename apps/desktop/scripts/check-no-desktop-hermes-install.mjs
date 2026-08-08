#!/usr/bin/env node
/**
 * PRD v1.3.1 — Desktop production src must not invoke Hermes install chains.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "src");

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const ALLOW_PREFIXES = [
  "main/installer.ts",
  "main/enterprise/",
  "main/user-config/user-config-applier-hermes.ts",
  "main/copilot-runtime-client/",
  "preload/copilot-runtime-api.ts",
  "shared/enterprise/",
  "references/",
];

const PATTERNS = [
  /\bcheck-install\b/,
  /\bverify-install\b/,
  /\bstart-install-with-source\b/,
  /ipcRenderer\.invoke\(\s*["']start-install["']/,
  /\brunInstallWithSource\b/,
  /\brunInstall\b(?!WithSource)/,
  /\bgit clone\b.*hermes/i,
  /\buv (pip|sync)\b/,
  /\bpip install\b.*hermes/i,
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(ROOT, full).replace(/\\/g, "/");
    if (rel.startsWith("references/")) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

const violations = [];
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  if (ALLOW_PREFIXES.some((prefix) => rel === prefix || rel.startsWith(prefix))) continue;
  const text = stripComments(readFileSync(file, "utf8"));
  for (const pattern of PATTERNS) {
    if (pattern.test(text)) {
      violations.push(`${rel} matches ${pattern}`);
      break;
    }
  }
}

if (violations.length) {
  console.error("[check:no-desktop-hermes-install] violations:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}

console.log("[check:no-desktop-hermes-install] ok");
