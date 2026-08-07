#!/usr/bin/env node
/**
 * Workbench 2.0 must not call legacy LocalTask HTTP paths (/api/v1/tasks).
 * Legacy Task Workbench v1 and task-client.ts remain allowlisted.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const LEGACY_TASK_PATH = /\/api\/v1\/tasks(?:\/|["'`\s]|$)/;

const violations = [];

const taskClient = join(ROOT, "src/renderer/src/lib/copilot-serve/task-client.ts");
const workbenchScreen = join(ROOT, "src/renderer/src/screens/TaskWorkbench/TaskWorkbenchScreen.tsx");
const runtimeClientWorkTask = join(
  ROOT,
  "../../packages/runtime-client-ts/src/domains/work-task.ts",
);

function checkRuntimeClient() {
  const text = readFileSync(runtimeClientWorkTask, "utf8");
  if (LEGACY_TASK_PATH.test(text)) {
    violations.push("packages/runtime-client-ts/src/domains/work-task.ts uses /api/v1/tasks");
  }
}

function checkWorkbenchV2() {
  const text = readFileSync(workbenchScreen, "utf8");
  const v2Start = text.indexOf("function WorkTaskWorkbenchV2");
  const exportStart = text.indexOf("export default function TaskWorkbenchScreen");
  if (v2Start < 0) return;
  const v2Body = text.slice(v2Start, exportStart >= 0 ? exportStart : undefined);
  if (LEGACY_TASK_PATH.test(v2Body)) {
    violations.push("TaskWorkbenchScreen.tsx WorkTaskWorkbenchV2 references /api/v1/tasks");
  }
}

function checkProjection() {
  const projection = join(ROOT, "src/renderer/src/screens/TaskWorkbench/taskWorkbenchProjection.ts");
  const text = readFileSync(projection, "utf8");
  if (LEGACY_TASK_PATH.test(text)) {
    violations.push("taskWorkbenchProjection.ts references /api/v1/tasks");
  }
}

checkRuntimeClient();
checkWorkbenchV2();
checkProjection();

if (violations.length > 0) {
  console.error("[check:no-legacy-local-task-client] violations:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}

console.log("[check:no-legacy-local-task-client] ok");
process.exit(0);
