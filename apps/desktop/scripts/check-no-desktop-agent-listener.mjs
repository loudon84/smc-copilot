#!/usr/bin/env node
/**
 * PRD v1.4.1 — Desktop Main must not create Agent Runtime listeners
 * (http.createServer / net.createServer) outside an explicit whitelist.
 *
 * Whitelist: Web Operator / Browser Tool Bridge, port probes, SSH/askpass,
 * and the disabled Expert MCP gateway module (not auto-started).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const MAIN = join(ROOT, "src/main");
const violations = [];

const WHITELIST_PREFIXES = [
  "src/main/browser/",
  "src/main/aios/",
  "src/main/enterprise/",
  "src/main/mcp-skill-gateway-runtime/",
];

const WHITELIST_FILES = new Set([
  "src/main/ssh-tunnel.ts",
  "src/main/askpass.ts",
  "src/main/runtime-reconciler.ts",
  "src/main/profile-runtime-manager.ts",
]);

function isWhitelisted(rel) {
  if (WHITELIST_FILES.has(rel)) return true;
  return WHITELIST_PREFIXES.some((p) => rel.startsWith(p));
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "out" || name === "dist") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|cjs|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

for (const file of walk(MAIN)) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  if (isWhitelisted(rel)) continue;
  const text = stripComments(readFileSync(file, "utf8"));
  if (
    /\bhttp\.createServer\b/.test(text) ||
    /\bnet\.createServer\b/.test(text) ||
    /from\s+["']http["'][\s\S]*\bcreateServer\b/.test(text) ||
    /from\s+["']node:http["'][\s\S]*\bcreateServer\b/.test(text) ||
    /from\s+["']net["'][\s\S]*\bcreateServer\b/.test(text) ||
    /from\s+["']node:net["'][\s\S]*\bcreateServer\b/.test(text) ||
    /import\s+\{\s*[^}]*\bcreateServer\b[^}]*\}\s+from\s+["'](?:node:)?(?:http|net)["']/.test(
      text,
    )
  ) {
    violations.push(`${rel}: createServer outside agent-listener whitelist`);
  }
}

if (violations.length) {
  console.error("[check:no-desktop-agent-listener] violations:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}

console.log("[check:no-desktop-agent-listener] ok");
