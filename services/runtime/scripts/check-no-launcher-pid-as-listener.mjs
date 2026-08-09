#!/usr/bin/env node
/**
 * PRD v1.5.2 §70 — forbid assigning launcher process.pid directly to gateway_listener_pid
 * without going through GatewayListenerResolver.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "src");
const BANNED = [
  /gateway_listener_pid\s*=\s*process\.pid/,
  /gateway_listener_pid\s*=\s*handle\.process\.pid/,
  /inst\.gateway_listener_pid\s*=\s*process\.pid/,
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

const allow = new Set([
  "runtime/gateway_listener.py",
  "services/gateway_ownership_service.py",
]);

const violations = [];
for (const file of walk(ROOT)) {
  const rel = relative(process.cwd(), file).replace(/\\/g, "/").replace(/^src\//, "");
  if (rel.startsWith("tests/") || allow.has(rel)) continue;
  // Allow persistence that copies from handle.listener_pid (already resolved).
  const text = readFileSync(file, "utf8");
  for (const re of BANNED) {
    if (re.test(text)) {
      violations.push(`${rel} :: ${re}`);
    }
  }
}

if (violations.length) {
  console.error("check:no-launcher-pid-as-listener FAILED:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}
console.log("check:no-launcher-pid-as-listener OK");
