#!/usr/bin/env node
/**
 * PRD v1.4 — profile-runtime.db must not grow new domain tables for sessions/messages/memory.
 * Lightweight: whitelist control-plane concerns; fail if memory.ts uses better-sqlite3.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const violations = [];

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Allowed CREATE TABLE / domain names in profile-runtime-db (control plane only). */
const WHITELIST_TABLE_HINTS = [
  "profile_runtime",
  "gateway_instance",
  "runtime_event",
  "delegation",
  "skill_sync",
  "session_share",
  "profile_role",
  "schema_version",
  "migration",
  "audit",
];

const FORBIDDEN_DOMAIN_TABLES = [
  /\bCREATE\s+TABLE\b[^;]*\b(sessions|messages|memory_entries|memories)\b/i,
  /\bCREATE\s+TABLE\b[^;]*\bchat_messages\b/i,
];

const memoryPath = join(ROOT, "src/main/memory.ts");
if (existsSync(memoryPath)) {
  const text = stripComments(readFileSync(memoryPath, "utf8"));
  if (/\bbetter-sqlite3\b/.test(text)) {
    violations.push("src/main/memory.ts must not use better-sqlite3 (Memory is Runtime-owned)");
  }
}

const dbPath = join(ROOT, "src/main/profile-runtime-db.ts");
if (existsSync(dbPath)) {
  const text = stripComments(readFileSync(dbPath, "utf8"));
  for (const pattern of FORBIDDEN_DOMAIN_TABLES) {
    if (pattern.test(text)) {
      violations.push(
        `src/main/profile-runtime-db.ts adds forbidden domain table matching ${pattern}`,
      );
    }
  }
  // Document whitelist in stderr on demand — keep check lightweight
  void WHITELIST_TABLE_HINTS;
}

if (violations.length) {
  console.error("[check:no-desktop-domain-db] violations:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}

console.log("[check:no-desktop-domain-db] ok");
