#!/usr/bin/env node
/**
 * PRD v1.4 — Desktop must not own Portal Runtime supervisor UI / startAiOs control.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const violations = [];

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const portalSection = join(
  ROOT,
  "src/renderer/src/screens/SettingsDrawer/server/PortalRuntimeSection.tsx",
);
if (existsSync(portalSection)) {
  violations.push(
    "src/renderer/src/screens/SettingsDrawer/server/PortalRuntimeSection.tsx must not exist (v1.4 thin client)",
  );
}

const settingsDrawerCandidates = [
  "src/renderer/src/screens/SettingsDrawer/SettingsDrawer.tsx",
  "src/renderer/src/screens/SettingsDrawer/server/ServerPanel.tsx",
];
for (const rel of settingsDrawerCandidates) {
  const full = join(ROOT, rel);
  if (!existsSync(full)) continue;
  const text = stripComments(readFileSync(full, "utf8"));
  if (/\bstartAiOs\b/.test(text)) {
    violations.push(`${rel} imports or calls startAiOs`);
  }
  if (/\bPortalRuntimeSection\b/.test(text)) {
    violations.push(`${rel} still references PortalRuntimeSection`);
  }
}

const aiosIpc = join(ROOT, "src/main/aios/aios-ipc.ts");
if (existsSync(aiosIpc)) {
  const text = stripComments(readFileSync(aiosIpc, "utf8"));
  if (/return\s+startAiOs\b/.test(text) || /startAiOs\s*\(\s*mainWindow\s*\)/.test(text)) {
    violations.push(
      "src/main/aios/aios-ipc.ts still calls startAiOs as a real implementation (stubs that throw are OK)",
    );
  }
  if (/from\s+["'].*aios-runtime-supervisor["']/.test(text) && /\bstartAiOs\b/.test(text)) {
    // Imported for live start — fail unless only error stubs remain without invoking.
    if (!/throw\s+new\s+Error/.test(text) || /return\s+startAiOs|await\s+startAiOs/.test(text)) {
      if (/await\s+startAiOs|return\s+startAiOs|startAiOs\s*\(/.test(text)) {
        violations.push(
          "src/main/aios/aios-ipc.ts imports aios-runtime-supervisor for live startAiOs",
        );
      }
    }
  }
}

if (violations.length) {
  console.error("[check:no-desktop-portal-runtime] violations:");
  for (const v of [...new Set(violations)]) console.error(" -", v);
  process.exit(1);
}

console.log("[check:no-desktop-portal-runtime] ok");
