#!/usr/bin/env node
/**
 * PRD v1.7 §60 — Kanban Renderer must not access Hermes directly.
 * Scans apps/desktop/src/renderer/src/modules/kanban for forbidden patterns.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const TARGET = join(ROOT, "src/renderer/src/modules/kanban");

const FORBIDDEN = [
  { name: "hermesAPI", re: /hermesAPI/ },
  { name: "HERMES_HOME", re: /HERMES_HOME/ },
  { name: "HERMES_PYTHON", re: /HERMES_PYTHON/ },
  { name: "execFile", re: /\bexecFile\b/ },
  { name: "kanban.db", re: /kanban\.db/ },
  { name: "hermes kanban", re: /hermes\s+kanban/i },
  { name: "kanban plugin path", re: /\/api\/plugins\/kanban/ },
  { name: "direct hermes port", re: /127\.0\.0\.1:\d{4,5}/ },
];

const violations = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx|css)$/.test(name)) continue;
    const text = readFileSync(full, "utf8");
    for (const rule of FORBIDDEN) {
      if (rule.re.test(text)) {
        violations.push(`${relative(ROOT, full)}: forbidden ${rule.name}`);
      }
    }
  }
}

walk(TARGET);

if (violations.length > 0) {
  console.error("[check:no-desktop-kanban-hermes-access] violations:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}

console.log("[check:no-desktop-kanban-hermes-access] ok");
process.exit(0);
