#!/usr/bin/env node
/**
 * PRD v1.4.1 — Desktop must not start local MCP Agent proxy (:18781).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const violations = [];

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

for (const file of walk(SRC)) {
  const text = readFileSync(file, "utf8");
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  if (
    text.includes("startMcpRuntimeProxy") ||
    text.includes("mcp-runtime-proxy") ||
    /[^0-9]18781[^0-9]/.test(text) ||
    text.includes(":18781")
  ) {
    violations.push(`${rel}: banned MCP proxy / :18781 reference`);
  }
}

if (violations.length) {
  console.error("[check:no-desktop-mcp-proxy] violations:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}

console.log("[check:no-desktop-mcp-proxy] ok");
