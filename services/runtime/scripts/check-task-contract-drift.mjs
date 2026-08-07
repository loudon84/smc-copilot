#!/usr/bin/env node
/**
 * Ensure task event contract artifacts stay aligned with TASK_EVENT_TYPES in Python.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(process.cwd(), "..", "..");
const SCHEMA_PATH = join(REPO_ROOT, "contracts", "runtime-events", "task-event.schema.json");
const VERSION_PATH = join(REPO_ROOT, "contracts", "version.json");
const PY_TYPES_PATH = join(process.cwd(), "src", "schemas", "task_events.py");

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function extractSchemaTypes(schema) {
  const types = new Set();
  for (const branch of schema.oneOf || []) {
    const constType = branch?.properties?.type?.const;
    if (constType) types.add(constType);
  }
  return types;
}

function extractPythonTypes(text) {
  const match = text.match(/TASK_EVENT_TYPES[^=]*=\s*frozenset\(\s*\{([^}]+)\}/s);
  if (!match) throw new Error("TASK_EVENT_TYPES frozenset not found in task_events.py");
  return new Set(
    [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]),
  );
}

const errors = [];

if (!existsSync(SCHEMA_PATH)) {
  errors.push(`missing schema: ${SCHEMA_PATH}`);
}
if (!existsSync(VERSION_PATH)) {
  errors.push(`missing version.json: ${VERSION_PATH}`);
}
if (!existsSync(PY_TYPES_PATH)) {
  errors.push(`missing task_events.py: ${PY_TYPES_PATH}`);
}

if (errors.length === 0) {
  const schemaTypes = extractSchemaTypes(loadJson(SCHEMA_PATH));
  const pyTypes = extractPythonTypes(readFileSync(PY_TYPES_PATH, "utf8"));
  const version = loadJson(VERSION_PATH);

  if (!version.runtimeEvents) {
    errors.push("contracts/version.json missing runtimeEvents");
  }

  if (schemaTypes.size !== 21) {
    errors.push(`schema defines ${schemaTypes.size} event types, expected 21`);
  }
  if (pyTypes.size !== 21) {
    errors.push(`TASK_EVENT_TYPES has ${pyTypes.size} entries, expected 21`);
  }

  for (const t of pyTypes) {
    if (!schemaTypes.has(t)) errors.push(`TASK_EVENT_TYPES has ${t} missing from schema`);
  }
  for (const t of schemaTypes) {
    if (!pyTypes.has(t)) errors.push(`schema has ${t} missing from TASK_EVENT_TYPES`);
  }
}

if (errors.length > 0) {
  console.error("[check:task-contract-drift] failures:");
  for (const e of errors) console.error(" -", e);
  process.exit(1);
}

console.log("[check:task-contract-drift] ok (21 task event types aligned)");
process.exit(0);
