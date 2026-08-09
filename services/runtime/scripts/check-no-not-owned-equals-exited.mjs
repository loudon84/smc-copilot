#!/usr/bin/env node
/**
 * PRD v1.5.2 §71 — forbid not-owned == exited inference.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "src");
const BANNED = [
  /if\s+not\s+ownership\.owned[\s\S]{0,120}EXITED/,
  /if\s+not\s+ownership\.owned[\s\S]{0,120}process_state\s*=\s*["']exited["']/,
  /not\s+ownership\.owned\s+and\s+not\s+tracked_alive/,
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "__pycache__" || name === ".venv") continue;
      walk(full, out);
    } else if (name.endsWith(".py")) out.push(full);
  }
  return out;
}

const violations = [];
for (const file of walk(ROOT)) {
  const rel = relative(process.cwd(), file).replace(/\\/g, "/");
  if (rel.includes("/tests/") || rel.startsWith("tests/")) continue;
  const text = readFileSync(file, "utf8");
  for (const re of BANNED) {
    if (re.test(text)) {
      violations.push(`${rel} :: ${re}`);
    }
  }
}

if (violations.length) {
  console.error("check:no-not-owned-equals-exited FAILED:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}
console.log("check:no-not-owned-equals-exited OK");
