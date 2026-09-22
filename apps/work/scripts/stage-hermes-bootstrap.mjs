#!/usr/bin/env node
/**
 * Stage `resources/hermes-bootstrap/install.ps1` for packaging.
 *
 * Source resolution (first hit wins):
 * 1. HERMES_BOOTSTRAP_INSTALL_PS1 / HERMES_INSTALL_PS1
 * 2. Sibling checkout ../hermes-agent/scripts/install.ps1 (monorepo neighbor)
 * 3. Common local forks (optional; not required for soft-skip builds)
 *
 * If no source is found, packaging continues without install.ps1 — runtime
 * soft-skips to READY when CLI + gateway health are already ok.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destDir = join(root, "resources", "hermes-bootstrap");
const dest = join(destDir, "install.ps1");

function candidateSources() {
  const out = [];
  for (const key of ["HERMES_BOOTSTRAP_INSTALL_PS1", "HERMES_INSTALL_PS1"]) {
    const v = process.env[key]?.trim();
    if (v) out.push(v);
  }
  // apps/work → repo root → sibling hermes-agent
  out.push(resolve(root, "..", "..", "hermes-agent", "scripts", "install.ps1"));
  out.push(resolve(root, "..", "hermes-agent", "scripts", "install.ps1"));
  // Optional local forks (dev machines only; never hardcoded into runtime)
  out.push("E:\\git\\hermes-agent\\scripts\\install.ps1");
  out.push("e:/git/hermes-agent/scripts/install.ps1");
  return out;
}

mkdirSync(destDir, { recursive: true });

const source = candidateSources().find((p) => existsSync(p));
if (!source) {
  console.warn(
    "[stage-hermes-bootstrap] install.ps1 not found — packaging without installer (soft-skip path).",
  );
  if (existsSync(dest)) {
    console.warn(`[stage-hermes-bootstrap] keeping existing staged file: ${dest}`);
  }
  process.exit(0);
}

copyFileSync(source, dest);
console.log(`[stage-hermes-bootstrap] staged ${source} → ${dest}`);
