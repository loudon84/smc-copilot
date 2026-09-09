#!/usr/bin/env node
/**
 * CI guard: local Gateway lifecycle must not be spawned from apps/work Main.
 * Work probes managed Gateway state only; OPSI/Salt own install and lifecycle.
 *
 * Scans production src/main (not tests). Remote SSH helpers may start a
 * Gateway on the remote host and are allowlisted.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mainRoot = join(root, "src/main");

const ALLOWLIST = new Set([
  "ssh-remote.ts",
  "runtime-management-backend.ts",
  "runtime-service-adapter.ts",
  "availability-backend.ts",
]);

const banned = [
  {
    label: "pythonw.exe Gateway / venv interpreter spawn",
    pattern: /pythonw\.exe/i,
  },
  {
    label: "HERMES_PYTHON spawn",
    pattern: /\bHERMES_PYTHON\b/,
  },
  {
    label: "python -m hermes_cli.main",
    pattern: /hermes_cli\.main/,
  },
  {
    label: "local hermes gateway run",
    pattern: /["']gateway["']\s*,\s*["']run["']/,
  },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path, out);
      continue;
    }
    if (!path.endsWith(".ts") || path.endsWith(".test.ts")) continue;
    if (ALLOWLIST.has(name)) continue;
    out.push(path);
  }
  return out;
}

const hits = [];
for (const file of walk(mainRoot)) {
  const text = readFileSync(file, "utf8");
  for (const rule of banned) {
    if (rule.pattern.test(text)) {
      hits.push(`${relative(root, file)}: ${rule.label}`);
    }
  }
}

const register = readFileSync(join(mainRoot, "ipc/register.ts"), "utf8");
if (!register.includes("MANAGED_GATEWAY_MESSAGE")) {
  hits.push(
    "ipc/register.ts: local start-gateway must refuse lifecycle with MANAGED_GATEWAY_MESSAGE",
  );
}

const hermes = readFileSync(join(mainRoot, "hermes.ts"), "utf8");
const startBlock = hermes.match(
  /export function startGatewayDetailed[\s\S]*?^export function startGateway\b/m,
);
if (!startBlock || !/refused|managed by the endpoint management service/i.test(startBlock[0])) {
  hits.push(
    "hermes.ts: startGatewayDetailed must remain a refuse stub (no local Gateway spawn)",
  );
}
if (startBlock && /\bspawn\s*\(/.test(startBlock[0])) {
  hits.push("hermes.ts: startGatewayDetailed must not spawn a Gateway process");
}

if (hits.length > 0) {
  console.error("[check:no-work-gateway-spawn] Forbidden local Gateway spawn / lifecycle:");
  for (const hit of hits) console.error(" -", hit);
  process.exit(1);
}

console.log("[check:no-work-gateway-spawn] OK");
