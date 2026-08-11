#!/usr/bin/env node
/**
 * CI guard: local Gateway lifecycle must not be spawned from apps/work Main
 * after Runtime ownership migration (except LegacyLocalRuntimeAdapter fallback).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const register = readFileSync(resolve(root, "src/main/ipc/register.ts"), "utf8");

const banned = [
  {
    label: "startGatewayDetailed() in local start-gateway handler",
    pattern: /return\s+startGatewayDetailed\s*\(/,
  },
  {
    label: "runHermesUpdate( local path without Runtime backend",
    pattern: /await\s+runHermesUpdate\s*\(/,
  },
  {
    label: "runHermesDoctor() local path without Runtime backend",
    pattern: /return\s+runHermesDoctor\s*\(/,
  },
];

const hits = banned.filter((b) => b.pattern.test(register));
if (hits.length > 0) {
  console.error("[check:no-work-gateway-spawn] Forbidden local Gateway/install paths in register.ts:");
  for (const h of hits) console.error(" -", h.label);
  process.exit(1);
}

// Local start-gateway must route through RuntimeManagementBackend.
if (!register.includes("getRuntimeManagementBackend().startGateway")) {
  console.error(
    "[check:no-work-gateway-spawn] start-gateway local path must call getRuntimeManagementBackend().startGateway()",
  );
  process.exit(1);
}

console.log("[check:no-work-gateway-spawn] OK");
