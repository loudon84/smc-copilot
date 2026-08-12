#!/usr/bin/env node
/**
 * Salt mode must refuse local Gateway spawn (ADR-026).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const register = readFileSync(resolve(root, "src/main/ipc/register.ts"), "utf8");
const hermes = readFileSync(resolve(root, "src/main/hermes.ts"), "utf8");
const startGatewayHandler = readFileSync(
  resolve(root, "src/main/hermes/control-owner.ts"),
  "utf8",
);

const violations = [];

if (!register.includes("isSaltControlOwner()")) {
  violations.push("register.ts must gate Gateway/install IPC with isSaltControlOwner()");
}
if (!register.includes('ipcMain.handle("start-gateway"')) {
  violations.push("register.ts missing start-gateway handler");
}
if (!/start-gateway[\s\S]*isSaltControlOwner\(\)/.test(register)) {
  violations.push("start-gateway handler must check isSaltControlOwner()");
}
if (!hermes.includes("isSaltControlOwner()")) {
  violations.push("hermes.ts startGatewayDetailed/restartGateway must check isSaltControlOwner()");
}
if (!startGatewayHandler.includes("saltManagedMessage")) {
  violations.push("control-owner.ts must export saltManagedMessage");
}

if (violations.length > 0) {
  console.error("[check:salt-mode-no-gateway-spawn] violations:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}

console.log("[check:salt-mode-no-gateway-spawn] OK");
