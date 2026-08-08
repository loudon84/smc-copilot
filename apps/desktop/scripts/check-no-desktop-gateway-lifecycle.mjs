#!/usr/bin/env node
/**
 * PRD v1.3.1 — Desktop quit/startup must not own Gateway lifecycle.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const mainIndex = readFileSync(join(ROOT, "src/main/index.ts"), "utf8");
const startupFiles = [
  "src/main/startup/startup-decision.ts",
  "src/main/startup/startup-ipc.ts",
  "src/main/startup/desktop-boot-coordinator.ts",
];

const violations = [];

if (/\bstopGateway\s*\(/.test(mainIndex)) {
  const lines = mainIndex.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (/\bstopGateway\s*\(/.test(lines[i])) {
      violations.push(`src/main/index.ts:${i + 1} calls stopGateway()`);
    }
  }
}

for (const rel of startupFiles) {
  const text = readFileSync(join(ROOT, rel), "utf8");
  if (/\bstartGateway\b/.test(text)) {
    violations.push(`${rel} imports or calls startGateway`);
  }
}

if (violations.length) {
  console.error("[check:no-desktop-gateway-lifecycle] violations:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}

console.log("[check:no-desktop-gateway-lifecycle] ok");
