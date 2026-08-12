#!/usr/bin/env node
/**
 * Renderer must never fetch Runtime HTTP (127.0.0.1:8765).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RENDERER_ROOT = join(ROOT, "src/renderer");

const FORBIDDEN = [
  /127\.0\.0\.1\s*:\s*8765/,
  /localhost\s*:\s*8765/,
  /COPILOT_SERVE_URL/,
  /HERMES_RUNTIME_SERVICE_URL/,
  /fetch\s*\(\s*['"`]https?:\/\/127\.0\.0\.1:8765/,
  /fetch\s*\(\s*['"`]https?:\/\/localhost:8765/,
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "out") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name)) out.push(full);
  }
  return out;
}

const files = walk(RENDERER_ROOT);
const violations = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const pattern of FORBIDDEN) {
    if (pattern.test(text)) {
      violations.push(`${relative(ROOT, file)} matches ${pattern}`);
    }
  }
}

if (violations.length > 0) {
  console.error("[check:no-renderer-runtime-http] violations:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}

console.log("[check:no-renderer-runtime-http] ok");
