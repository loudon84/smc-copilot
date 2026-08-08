#!/usr/bin/env node
/**
 * PRD v1.4 — Desktop must not auto-start Expert MCP local proxy (:48742).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const violations = [];

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const mainIndex = stripComments(readFileSync(join(ROOT, "src/main/index.ts"), "utf8"));

if (/\bautoStartMcpSkillGatewayIfReady\s*\(/.test(mainIndex)) {
  violations.push(
    "src/main/index.ts live-calls autoStartMcpSkillGatewayIfReady() (Expert MCP is Runtime-owned)",
  );
}

// Proxy listen on 48742 from app ready path in index.ts
if (/48742/.test(mainIndex) && /\b(listen|createServer|startProxy|startMcp)\b/.test(mainIndex)) {
  violations.push("src/main/index.ts appears to start MCP proxy listen on 48742 at app ready");
}

if (violations.length) {
  console.error("[check:no-desktop-expert-mcp-proxy] violations:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}

console.log("[check:no-desktop-expert-mcp-proxy] ok");
