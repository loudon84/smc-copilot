#!/usr/bin/env node
/**
 * PRD v1.4 — start-gateway / stop-gateway IPC must not call Gateway process managers.
 * Stubs that throw or return without calling startGateway/stopGateway are OK.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const mainIndex = readFileSync(join(ROOT, "src/main/index.ts"), "utf8");
const violations = [];

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Extract body of ipcMain.handle("channel", ...) — best-effort brace match.
 * @param {string} source
 * @param {string} channel
 */
function extractHandlerBody(source, channel) {
  const re = new RegExp(
    `ipcMain\\.handle\\(\\s*["']${channel}["']\\s*,\\s*async\\s*\\([^)]*\\)\\s*=>\\s*\\{`,
  );
  const m = re.exec(source);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  const start = i;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    i += 1;
  }
  return source.slice(start, i - 1);
}

const stripped = stripComments(mainIndex);
for (const channel of ["start-gateway", "stop-gateway"]) {
  const body = extractHandlerBody(stripped, channel);
  if (body == null) continue;
  if (/\bstartGateway\s*\(/.test(body) || /\bstartGatewayAsync\s*\(/.test(body)) {
    violations.push(
      `src/main/index.ts ${channel} handler live-calls startGateway / startGatewayAsync`,
    );
  }
  if (/\bstopGateway\s*\(/.test(body) || /\bstopGatewayAsync\s*\(/.test(body)) {
    violations.push(
      `src/main/index.ts ${channel} handler live-calls stopGateway / stopGatewayAsync`,
    );
  }
}

if (violations.length) {
  console.error("[check:no-desktop-hermes-control] violations:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}

console.log("[check:no-desktop-hermes-control] ok");
