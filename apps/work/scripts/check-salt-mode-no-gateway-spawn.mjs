#!/usr/bin/env node
/**
 * Salt/OPSI managed mode must refuse local Gateway spawn (ADR-026 / ADR-031).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const register = readFileSync(resolve(root, "src/main/ipc/register.ts"), "utf8");
const controlOwner = readFileSync(
  resolve(root, "src/main/hermes/control-owner.ts"),
  "utf8",
);

const violations = [];

if (
  !register.includes("isSaltControlOwner()") &&
  !register.includes("isExternallyManagedControlOwner()")
) {
  violations.push(
    "register.ts must gate install/lifecycle IPC with isSaltControlOwner() or isExternallyManagedControlOwner()",
  );
}
if (!register.includes('ipcMain.handle("start-gateway"')) {
  violations.push("register.ts missing start-gateway handler");
}
if (!/start-gateway[\s\S]*MANAGED_GATEWAY_MESSAGE/.test(register)) {
  violations.push("start-gateway handler must refuse local lifecycle with MANAGED_GATEWAY_MESSAGE");
}
if (!controlOwner.includes("saltManagedMessage")) {
  violations.push("control-owner.ts must export saltManagedMessage");
}
if (!controlOwner.includes("externallyManagedMessage")) {
  violations.push("control-owner.ts must export externallyManagedMessage");
}

if (violations.length > 0) {
  console.error("[check:salt-mode-no-gateway-spawn] violations:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}

console.log("[check:salt-mode-no-gateway-spawn] OK");
