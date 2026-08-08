#!/usr/bin/env node
/**
 * PRD v1.4 — Desktop must not spawn / deploy Copilot Serve (Runtime) processes.
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

const ipcPath = join(ROOT, "src/main/copilot-serve/copilot-serve-ipc.ts");
if (existsSync(ipcPath)) {
  const text = stripComments(readFileSync(ipcPath, "utf8"));
  if (/\bstartCopilotServeProcess\s*\(/.test(text)) {
    violations.push(
      "src/main/copilot-serve/copilot-serve-ipc.ts live call startCopilotServeProcess()",
    );
  }
  if (/\brunCopilotServeDeploy\s*\(/.test(text)) {
    violations.push(
      "src/main/copilot-serve/copilot-serve-ipc.ts live call runCopilotServeDeploy(",
    );
  }
  // Active spawn in production IPC path
  if (/\bspawn\s*\(/.test(text) || /\bspawnSync\s*\(/.test(text)) {
    violations.push(
      "src/main/copilot-serve/copilot-serve-ipc.ts invokes spawn in production path",
    );
  }
}

if (violations.length) {
  console.error("[check:no-desktop-runtime-process-control] violations:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}

console.log("[check:no-desktop-runtime-process-control] ok");
