#!/usr/bin/env node
/**
 * Hard gate (PRD v1.2 Phase 5): production Desktop code must not call
 * Serve instance chat completions (instances + chat/completions).
 * Workspace Chat uses chat-runs via chatRuntimeClient.
 *
 * Scan: apps/desktop/src (main / preload / renderer / shared under src).
 * Allowed: tests, fixtures, and lines that clearly document the forbidden path
 * (migration / forbid / Phase comments).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/** Path segments / file patterns that may mention the legacy URL for tests/docs. */
const ALLOW_PATH_SUBSTRINGS = [
  "/tests/",
  "\\tests\\",
  "/fixtures/",
  "\\fixtures\\",
  ".test.ts",
  ".test.tsx",
  ".spec.ts",
  ".spec.tsx",
  "check-no-direct-instance-chat",
];

/**
 * @param {string} dir
 * @param {string[]} out
 */
function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name === "out") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function isAllowlistedPath(rel) {
  const normalized = rel.replace(/\\/g, "/");
  return ALLOW_PATH_SUBSTRINGS.some((s) => {
    const needle = s.replace(/\\/g, "/");
    return normalized.includes(needle);
  });
}

function isAllowlistedLine(line) {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
    if (
      /migrat|legacy|forbid|Phase\s*5|cutover|must not|deprecated/i.test(line) ||
      line.includes("\u7981\u6b62") ||
      line.includes("\u4e0d\u518d") ||
      line.includes("\u5220\u9664")
    ) {
      return true;
    }
  }
  return false;
}

/** True when a source line references Serve instance chat completions. */
function lineMentionsInstanceChatCompletions(line) {
  if (!line.includes("chat/completions") && !line.includes("chat\\/completions")) {
    return false;
  }
  if (line.includes("/instances/") || line.includes("/instances\\/")) return true;
  if (line.includes("instances/" + "${")) return true;
  if (line.includes('instances/"') || line.includes("instances/'")) return true;
  return false;
}

const hits = [];
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  if (isAllowlistedPath(rel)) continue;
  const text = readFileSync(file, "utf8");
  if (!text.includes("chat/completions")) continue;
  if (!text.includes("instances")) continue;
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!lineMentionsInstanceChatCompletions(line)) return;
    if (isAllowlistedLine(line)) return;
    hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 140)}`);
  });
}

if (hits.length > 0) {
  console.error(
    "[check:no-direct-instance-chat] production code must not reference instances/*/chat/completions:",
  );
  for (const h of hits.slice(0, 50)) console.error("  ", h);
  if (hits.length > 50) console.error(`  ... and ${hits.length - 50} more`);
  process.exit(1);
}

console.log(
  "[check:no-direct-instance-chat] ok (no production instances/*/chat/completions)",
);
process.exit(0);
