#!/usr/bin/env node
/**
 * Desktop must not manage Hermes gateway ports (allocate/kill/listen) in production src.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "src");
const FORBIDDEN = [
  /find_pids_listening_on_port/,
  /kill.*8642/,
  /net\.createServer\([^)]*8642/,
  /listen\(\s*8642\s*\)/,
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

const violations = [];
for (const file of walk(ROOT)) {
  const rel = relative(process.cwd(), file).replace(/\\/g, "/");
  const text = readFileSync(file, "utf8");
  for (const re of FORBIDDEN) {
    if (re.test(text)) violations.push(`${rel} :: ${re}`);
  }
}

if (violations.length) {
  console.error("check:no-desktop-port-management FAILED:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}
console.log("check:no-desktop-port-management OK");
