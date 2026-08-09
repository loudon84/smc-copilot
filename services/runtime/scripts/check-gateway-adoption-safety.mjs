#!/usr/bin/env node
/**
 * PRD v1.5.1 §73 — forbid deriving ownership solely from gateway health.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(process.cwd(), "src");
const BANNED = [
  /if\s+health_ok:\s*ownership\s*=\s*["']owned["']/,
  /if\s+health\.healthy:\s*\n\s*ownership(?:_state)?\s*=\s*(?:OwnershipState\.OWNED|["']owned["'])/,
  /if\s*\(\s*health_ok\s*\)\s*\{\s*ownership\s*=\s*["']owned["']/,
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
  console.error("check:gateway-adoption-safety FAILED:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}
console.log("check:gateway-adoption-safety OK");
