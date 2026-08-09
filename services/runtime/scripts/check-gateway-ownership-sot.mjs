#!/usr/bin/env node
/**
 * PRD v1.5.2 §69 — InstanceGatewayService must not call verify_ownership directly.
 * Ownership SOT is GatewayOwnershipService.inspect().
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const target = join(process.cwd(), "src", "services", "instance_gateway_service.py");
const text = readFileSync(target, "utf8");

if (/verify_ownership\s*\(/.test(text)) {
  console.error(
    "check:gateway-ownership-sot FAILED: instance_gateway_service.py must not call verify_ownership(",
  );
  process.exit(1);
}
if (/def\s+_ownership_for\s*\(/.test(text)) {
  console.error(
    "check:gateway-ownership-sot FAILED: _ownership_for must be removed from InstanceGatewayService",
  );
  process.exit(1);
}
console.log("check:gateway-ownership-sot OK");
