#!/usr/bin/env node
/**
 * runtime/tasks must not call Hermes /v1/chat/completions directly — use AgentExecutionKernel.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "src/runtime/tasks");
const FORBIDDEN = [
  /\/v1\/chat\/completions/,
  /httpx\.[A-Za-z]*stream\s*\([^)]*chat\/completions/,
  /client\.stream\s*\([^)]*chat\/completions/,
];

/**
 * @param {string} dir
 * @param {string[]} out
 */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.py$/.test(name)) out.push(full);
  }
  return out;
}

const violations = [];
for (const file of walk(ROOT)) {
  const rel = relative(process.cwd(), file).replace(/\\/g, "/");
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) return;
    if (/Kernel|kernel|AgentExecutionKernel|sole owner|do not|禁止|except comments|removed; use/i.test(line)) return;
    for (const pattern of FORBIDDEN) {
      if (!pattern.test(line)) continue;
      violations.push(`${rel}:${index + 1}: ${trimmed.slice(0, 140)}`);
    }
  });
}

if (violations.length > 0) {
  console.error("[check:no-task-direct-hermes] violations:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}

console.log("[check:no-task-direct-hermes] ok");
process.exit(0);
