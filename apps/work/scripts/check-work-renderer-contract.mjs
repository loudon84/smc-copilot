#!/usr/bin/env node
/**
 * CI guard: ensure window.hermesAPI runtime/gateway surface methods remain exported.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const preload = readFileSync(resolve(root, "src/preload/index.ts"), "utf8");

const required = [
  "runtimeProbeLocal",
  "runtimeEnsureLocalReady",
  "runtimeGetStatus",
  "runtimeRestart",
  "runtimeValidateHome",
  "runtimeAdoptHome",
  "getControlOwner",
  "onRuntimeStatusChanged",
  "onInstallProgress",
  "getHermesVersion",
  "refreshHermesVersion",
  "runHermesDoctor",
  "runHermesUpdate",
  "startGateway",
  "stopGateway",
  "restartGateway",
  "gatewayStatus",
];

const missing = required.filter((name) => !preload.includes(`${name}:`));
if (missing.length > 0) {
  console.error(
    "[check:work-renderer-contract] Missing hermesAPI methods:",
    missing.join(", "),
  );
  process.exit(1);
}

console.log(
  `[check:work-renderer-contract] OK (${required.length} runtime/gateway APIs present)`,
);
