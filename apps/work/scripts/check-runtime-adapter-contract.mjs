#!/usr/bin/env node
/**
 * CI guard: production Main/IPC/Startup must use LegacyLocalRuntimeAdapter only.
 * Historical adapters may exist for tests but must not enter the production graph.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PRODUCTION_ROOTS = [
  join(root, "src/main"),
  join(root, "src/renderer/src"),
];

const ALLOWED_HISTORICAL = new Set([
  "availability-backend.ts",
  "runtime-service-adapter.ts",
  "runtime-management-backend.ts",
  "runtime-management-mapper.ts",
  "runtime-service-client.ts",
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path, out);
      continue;
    }
    if (!path.endsWith(".ts") && !path.endsWith(".tsx")) continue;
    if (ALLOWED_HISTORICAL.has(name)) continue;
    out.push(path);
  }
  return out;
}

const banned = [
  {
    label: "RuntimeServiceAdapter in production Main graph",
    pattern: /new\s+RuntimeServiceAdapter\s*\(/,
  },
  {
    label: "HermesAvailabilityBackend in production Main graph",
    pattern: /new\s+HermesAvailabilityBackend\s*\(/,
  },
  {
    label: "RuntimeManager.setAdapter in production Main graph",
    pattern: /\.setAdapter\s*\(/,
  },
  {
    label: "RuntimeServiceAdapter import in production Main graph",
    pattern: /from\s+["'][^"']*runtime-service-adapter["']/,
  },
  {
    label: "HermesAvailabilityBackend import in production Main graph",
    pattern: /from\s+["'][^"']*availability-backend["']/,
  },
];

const files = PRODUCTION_ROOTS.flatMap((dir) => walk(dir));
const hits = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const rule of banned) {
    if (rule.pattern.test(text)) {
      hits.push(`${file.replace(root + "\\", "").replace(root + "/", "")}: ${rule.label}`);
    }
  }
}

if (hits.length > 0) {
  console.error("[check:runtime-adapter-contract] Forbidden production runtime adapter usage:");
  for (const hit of hits) console.error(" -", hit);
  process.exit(1);
}

console.log("[check:runtime-adapter-contract] OK");
