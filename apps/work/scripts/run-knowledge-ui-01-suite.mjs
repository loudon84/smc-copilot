#!/usr/bin/env node
/** WORK-KNOWLEDGE-UI-01 evidence runners — Windows-safe npm wrappers. */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const suite = process.argv[2];

const SUITES = {
  V01: [
    "tests/knowledge-route-scope.test.ts",
    "tests/knowledge-page-host.test.ts",
  ],
  V02: ["tests/knowledge-home-page.test.ts"],
  V03: [
    "tests/knowledge-bases-page.test.ts",
    "tests/knowledge-sets-page.test.ts",
  ],
  V04: ["tests/knowledge-documents-page.test.ts"],
  V05: ["tests/knowledge-uploads-page.test.ts"],
  V06: ["tests/knowledge-chat-page.test.ts"],
  V07: [
    "tests/layout-knowledge-view.test.ts",
    "tests/knowledge-fail-closed.test.ts",
  ],
};

const files = SUITES[suite];
if (!files) {
  console.error(`Unknown suite ${suite}`);
  process.exit(2);
}

const result = spawnSync(
  "npm",
  ["test", "--", "--passWithNoTests=false", ...files],
  { cwd: workRoot, stdio: "inherit", shell: true },
);
process.exit(result.status ?? 1);
