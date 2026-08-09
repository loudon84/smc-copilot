#!/usr/bin/env node
/**
 * Forbid legacy health semantics: status_code < 500 → healthy.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const file = join(process.cwd(), "src/integrations/hermes/client.py");
const src = readFileSync(file, "utf8");

const forbidden = [
  /status_code\s*<\s*500/,
  /resp\.status_code\s*<\s*500/,
];

const hits = [];
for (const re of forbidden) {
  if (re.test(src)) hits.push(re.source);
}

if (!src.includes("GatewayHealthResult")) {
  hits.push("missing GatewayHealthResult");
}
if (!src.includes("GATEWAY_AUTH_FAILED")) {
  hits.push("missing GATEWAY_AUTH_FAILED");
}

if (hits.length) {
  console.error("check:gateway-health-semantics FAILED:");
  for (const h of hits) console.error(" -", h);
  process.exit(1);
}
console.log("check:gateway-health-semantics OK");
