#!/usr/bin/env node
/**
 * Soft gate (Phase 3+): warn / fail on new production references to legacy
 * `/profiles/{id}/chat/*` Serve paths. Full Phase 8 will delete legacy chat modules.
 *
 * Scan: src/main, src/preload, src/renderer (not tests, not generated snapshots).
 * Allowlist: comments documenting migration / check scripts.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const ROOTS = ["src/main", "src/preload", "src/renderer"];
const PATTERN = /\/profiles\/[^"'`\s]+\/chat\//g;
const ALLOW_FILE_SUBSTRINGS = [
  "check-no-legacy-profile-chat",
  "openapi.snapshot",
  "generated/copilot-serve",
  // Phase 8 deletion targets — still live until Workspaces chat cutover
  "workspace-chat/workspace-chat-client.ts",
];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "dist" || name === "out") continue;
      walk(full, out);
    } else if (/\.(ts|tsx|js|mjs)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const hits = [];
for (const root of ROOTS) {
  for (const file of walk(join(ROOT, root))) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    if (ALLOW_FILE_SUBSTRINGS.some((s) => rel.includes(s))) continue;
    const text = readFileSync(file, "utf8");
    const matches = text.match(PATTERN);
    if (!matches) continue;
    // Ignore pure documentation strings that also mention instance paths.
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!PATTERN.test(line)) return;
      PATTERN.lastIndex = 0;
      if (line.includes("/instances/") && line.includes("migrate")) return;
      if (line.trimStart().startsWith("*") || line.trimStart().startsWith("//")) {
        // Allow PRD-style comments if they mention migration away from profiles chat.
        if (/migrat|legacy|forbid|禁止|Phase 8/i.test(line)) return;
      }
      hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
}

if (hits.length > 0) {
  console.error("[check:no-legacy-profile-chat] found legacy /profiles/*/chat/ references:");
  for (const h of hits.slice(0, 50)) console.error("  ", h);
  if (hits.length > 50) console.error(`  ... and ${hits.length - 50} more`);
  process.exit(1);
}

console.log("[check:no-legacy-profile-chat] ok (no production /profiles/*/chat/ paths)");
process.exit(0);
