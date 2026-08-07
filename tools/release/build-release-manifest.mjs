#!/usr/bin/env node
/**
 * Build release-manifest.json from package versions + contracts/version.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
}

function readTomlVersion(rel) {
  const text = readFileSync(join(ROOT, rel), "utf8");
  const m = text.match(/^version\s*=\s*"([^"]+)"/m);
  if (!m) throw new Error(`version not found in ${rel}`);
  return m[1];
}

const desktop = readJson("apps/desktop/package.json");
const contracts = readJson("contracts/version.json");
const runtimeVersion = readTomlVersion("services/runtime/pyproject.toml");

const manifest = {
  generatedAt: new Date().toISOString(),
  desktop: {
    version: desktop.version,
    artifact: `SMC-Copilot-${desktop.version}-setup.exe`,
  },
  runtime: {
    version: runtimeVersion,
    artifact: `SMC-Copilot-Runtime-Setup-${runtimeVersion}.exe`,
  },
  contracts: {
    runtimeApi: contracts.runtimeApi,
    runtimeEvents: contracts.runtimeEvents,
    compatibility: contracts.compatibility,
  },
};

const outDir = join(ROOT, "artifacts");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, "release-manifest.json");
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`[build-release-manifest] wrote ${out}`);
console.log(JSON.stringify(manifest, null, 2));
