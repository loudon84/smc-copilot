#!/usr/bin/env node
/**
 * PRD v1.5.4 §H — DesktopBootCoordinator must not auto-start Runtime/Serve.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const file = join(
  process.cwd(),
  "src",
  "main",
  "startup",
  "desktop-boot-coordinator.ts",
);
const text = readFileSync(file, "utf8");

const banned = [
  "autoStartCopilotServeIfReady",
  "startCopilotServeProcess",
  "canSpawnCopilotServe",
];

const violations = banned.filter((token) => text.includes(token));
if (violations.length) {
  console.error("[check:no-desktop-runtime-spawn] violations in desktop-boot-coordinator.ts:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}

if (!text.includes("initCopilotRuntimeConnection")) {
  console.error(
    "[check:no-desktop-runtime-spawn] bootstrap must call initCopilotRuntimeConnection()",
  );
  process.exit(1);
}

console.log("[check:no-desktop-runtime-spawn] ok");
