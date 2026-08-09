#!/usr/bin/env node
/**
 * PRD v1.5.3 §98 — Business code must use HermesGatewayClientFactory, not raw keyed construction.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const srcRoot = join(process.cwd(), "src");

/** Supervisor / client internals may construct HermesGatewayClient directly. */
const ALLOWLIST = new Set([
  "integrations/hermes/client.py",
  "integrations/hermes/client_factory.py",
  "services/instance_gateway_service.py",
  "services/gateway_supervisor.py",
  "services/gateway_ownership_service.py",
  "runtime/gateway_process.py",
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".py")) out.push(p);
  }
  return out;
}

const pattern = /HermesGatewayClient\s*\([^)]*api_key\s*=/;
let failed = false;

for (const file of walk(srcRoot)) {
  const rel = relative(srcRoot, file).replace(/\\/g, "/");
  if (ALLOWLIST.has(rel)) continue;
  const text = readFileSync(file, "utf8");
  if (pattern.test(text)) {
    console.error(
      `check:gateway-credential-factory FAILED: ${rel} constructs HermesGatewayClient(... api_key=) — use HermesGatewayClientFactory`,
    );
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("check:gateway-credential-factory OK");
