#!/usr/bin/env node
/**
 * CI guard: production Main/scripts must not reintroduce Hermes Python
 * Source Runtime or Self-Install path literals (AC-01 / AC-19).
 *
 * Test fixtures may keep historical literals. Remote SSH dashboard helpers
 * may mention remote hermes_cli/web_dist and are allowlisted.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SCAN_ROOTS = [join(root, "src/main"), join(root, "scripts")];

const ALLOWLIST_NAMES = new Set([
  "ssh-remote.ts",
  "hermes-agent-compat.ts",
  "check-no-legacy-hermes-runtime.mjs",
  "check-no-work-gateway-spawn.mjs",
]);

const banned = [
  { label: "HERMES_PYTHON", pattern: /\bHERMES_PYTHON\b/ },
  { label: "HERMES_REPO", pattern: /\bHERMES_REPO\b/ },
  { label: "HERMES_VENV", pattern: /\bHERMES_VENV\b/ },
  { label: "hermesCliArgs", pattern: /\bhermesCliArgs\b/ },
  { label: "looksLikeHermesHome", pattern: /\blooksLikeHermesHome\b/ },
  { label: "installBinariesFor", pattern: /\binstallBinariesFor\b/ },
  { label: "hermes_cli.main", pattern: /hermes_cli\.main/ },
  { label: "hermes_cli.models invocation", pattern: /hermes_cli\.models/ },
  { label: "hermes_cli.web_server", pattern: /hermes_cli\.web_server/ },
  { label: "tools.transcription_tools", pattern: /tools\.transcription_tools/ },
  { label: "hermes-agent/venv", pattern: /hermes-agent[/\\]venv/ },
  { label: "pythonw.exe", pattern: /pythonw\.exe/i },
  {
    label: "join(HERMES_HOME|getHermesHome(), 'hermes-agent')",
    pattern:
      /join\(\s*(?:HERMES_HOME|getHermesHome\(\))\s*,\s*["']hermes-agent["']/,
  },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "out") continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path, out);
      continue;
    }
    if (ALLOWLIST_NAMES.has(name)) continue;
    if (path.endsWith(".test.ts") || path.endsWith(".test.tsx")) continue;
    if (!/\.(ts|tsx|js|mjs|cjs|ps1)$/.test(name)) continue;
    out.push(path);
  }
  return out;
}

const hits = [];
for (const dir of SCAN_ROOTS) {
  for (const file of walk(dir)) {
    const text = readFileSync(file, "utf8");
    for (const rule of banned) {
      if (rule.pattern.test(text)) {
        hits.push(`${relative(root, file)}: ${rule.label}`);
      }
    }
  }
}

if (hits.length > 0) {
  console.error(
    "[check:no-legacy-hermes-runtime] Forbidden Hermes Python/source runtime literals:",
  );
  for (const hit of hits) console.error(" -", hit);
  process.exit(1);
}

console.log("[check:no-legacy-hermes-runtime] OK");
