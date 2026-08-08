#!/usr/bin/env node
/**
 * PRD v1.3.1 — ban Hermes Gateway port/path in startup-critical production src.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const WATCH = [
  "src/main/startup/startup-decision.ts",
  "src/main/startup/desktop-boot-coordinator.ts",
  "src/renderer/src/App.tsx",
  "src/renderer/src/hooks/useStartupGate.ts",
  "src/renderer/src/screens/RuntimeRecovery/RuntimeRecoveryScreen.tsx",
  "src/renderer/src/screens/RuntimeRecovery/RuntimeRecoveryActions.tsx",
  "src/renderer/src/screens/RuntimeRecovery/RuntimeRecoveryStatus.tsx",
  "src/renderer/src/modules/hermes-runtime/sections/HermesConnectionSection.tsx",
];

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const BANNED = [/[^0-9]8642[^0-9]/, /\/v1\/chat\/completions/];

const violations = [];
for (const rel of WATCH) {
  const full = join(ROOT, rel);
  let text;
  try {
    text = stripComments(readFileSync(full, "utf8"));
  } catch {
    continue;
  }
  for (const pattern of BANNED) {
    if (pattern.test(text)) {
      violations.push(`${rel} matches ${pattern}`);
    }
  }
}

if (violations.length) {
  console.error("[check:no-desktop-hermes-port] violations:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}

console.log("[check:no-desktop-hermes-port] ok");
