#!/usr/bin/env node
/**
 * WorkTask status changes must go through state_machine.transition().
 * Scans runtime/tasks for direct task.status assignments.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "src/runtime/tasks");

const ALLOW_FILES = new Set([
  "runtime/tasks/state_machine.py",
  "runtime/tasks/lease_manager.py",
]);

const ASSIGNMENT = /\btask\.status\s*=/;

/**
 * @param {string} dir
 * @param {string[]} out
 */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "__pycache__") continue;
      walk(full, out);
    } else if (name.endsWith(".py")) {
      out.push(full);
    }
  }
  return out;
}

const violations = [];
for (const file of walk(ROOT)) {
  const rel = relative(join(process.cwd(), "src"), file).replace(/\\/g, "/");
  if (ALLOW_FILES.has(rel)) continue;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) return;
    if (!ASSIGNMENT.test(line)) return;
    if (/task\.status\s*==/.test(line)) return;
    if (/transition\s*\(/.test(line)) return;
    violations.push(`${rel}:${index + 1}: ${trimmed.slice(0, 140)}`);
  });
}

if (violations.length > 0) {
  console.error("[check:worktask-state-machine] possible WorkTask status bypass:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}

console.log("[check:worktask-state-machine] ok");
process.exit(0);
