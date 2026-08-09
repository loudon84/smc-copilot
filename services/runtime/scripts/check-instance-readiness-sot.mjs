#!/usr/bin/env node
/**
 * Readiness must resolve default instance by name == "default", never limit(1).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const file = join(process.cwd(), "src/services/runtime_status_service.py");
const src = readFileSync(file, "utf8");

if (/select\(\s*HermesInstance\s*\)\s*\.limit\(\s*1\s*\)/.test(src)) {
  console.error(
    "check:instance-readiness-sot FAILED: select(HermesInstance).limit(1) is forbidden",
  );
  process.exit(1);
}
if (!src.includes('name == "default"') && !src.includes("name == 'default'")) {
  console.error('check:instance-readiness-sot FAILED: missing name == "default" query');
  process.exit(1);
}

console.log("check:instance-readiness-sot OK");
