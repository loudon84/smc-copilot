#!/usr/bin/env node
/**
 * Require process ownership fingerprint helpers; forbid kill-by-port-alone patterns in gateway_process.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const file = join(process.cwd(), "src/runtime/gateway_process.py");
const src = readFileSync(file, "utf8");

const required = [
  "GatewayProcessFingerprint",
  "verify_ownership",
  "check_port_ownership",
  "process_create_time",
];

const missing = required.filter((s) => !src.includes(s));
if (missing.length) {
  console.error("check:gateway-process-ownership FAILED: missing", missing.join(", "));
  process.exit(1);
}

// Instance gateway must not kill without ownership path
const igs = readFileSync(join(process.cwd(), "src/services/instance_gateway_service.py"), "utf8");
if (!igs.includes("verify_ownership") && !igs.includes("_ownership_for")) {
  console.error("check:gateway-process-ownership FAILED: InstanceGatewayService missing ownership check");
  process.exit(1);
}

console.log("check:gateway-process-ownership OK");
