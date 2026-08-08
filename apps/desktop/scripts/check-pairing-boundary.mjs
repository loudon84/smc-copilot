#!/usr/bin/env node
/**
 * PRD v1.3.2 — Renderer must not own Pairing protocol / secrets.
 * Forbidden in src/renderer: pairings start/confirm HTTP paths, challenge secrets, deviceToken secrets.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const RENDERER_ROOT = join(ROOT, "src/renderer");

const FORBIDDEN = [
  { id: "pairings-start", pattern: /\/api\/v1\/pairings\/start|\/pairings\/start/ },
  { id: "pairings-confirm", pattern: /\/pairings\/[^"'`\s]+\/confirm/ },
  { id: "challenge-secret", pattern: /challenge\s*[:=]\s*['"`][^'"`]+['"`]/ },
  { id: "device-token-secret", pattern: /deviceToken\s*[:=]\s*['"`][^'"`]+['"`]/ },
];

/**
 * @param {string} dir
 * @param {string[]} out
 */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "out") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name)) out.push(full);
  }
  return out;
}

const files = walk(RENDERER_ROOT);
const violations = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const rule of FORBIDDEN) {
    if (rule.pattern.test(text)) {
      violations.push(`${relative(ROOT, file)} matches ${rule.id}`);
    }
  }
}

if (violations.length > 0) {
  console.error("[check:pairing-boundary] violations:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}

console.log("[check:pairing-boundary] ok");
