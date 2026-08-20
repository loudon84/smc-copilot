#!/usr/bin/env node
/**
 * CI guard: local Gateway lifecycle must not be spawned from apps/work Main.
 * Work probes managed Gateway state only; OPSI/Salt own install and lifecycle.
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
    label: "RuntimeManagementBackend.startGateway() in local lifecycle path",
    pattern: /getRuntimeManagementBackend\(\)\.startGateway/,
  },
  {
    label: "local startGateway() spawn from register.ts",
    pattern: /(?<![\w.])startGateway\s*\(/,
  },
];

const hits = banned.filter((b) => b.pattern.test(register));
if (hits.length > 0) {
  console.error("[check:no-work-gateway-spawn] Forbidden local Gateway/install paths in register.ts:");
  for (const h of hits) console.error(" -", h.label);
  process.exit(1);
}

if (!register.includes("MANAGED_GATEWAY_MESSAGE")) {
  console.error(
    "[check:no-work-gateway-spawn] local start-gateway must refuse lifecycle with MANAGED_GATEWAY_MESSAGE",
  );
  process.exit(1);
}

console.log("[check:no-work-gateway-spawn] OK");
