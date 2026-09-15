#!/usr/bin/env node
/**
 * WORK-KNOWLEDGE-UI-01 V08 aggregate gate (typecheck + guard + targeted tests).
 * Single entrypoint so evidence.py can exec without shell `&&` on Windows.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(args) {
  const result = spawnSync("npm", args, {
    cwd: workRoot,
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(["run", "typecheck"]);
run(["run", "guard"]);
run([
  "test",
  "--",
  "--passWithNoTests=false",
  "tests/knowledge-page-host.test.ts",
  "tests/knowledge-home-page.test.ts",
  "tests/knowledge-bases-page.test.ts",
  "tests/knowledge-sets-page.test.ts",
  "tests/knowledge-documents-page.test.ts",
  "tests/knowledge-uploads-page.test.ts",
  "tests/knowledge-chat-page.test.ts",
  "tests/knowledge-fail-closed.test.ts",
  "tests/layout-knowledge-view.test.ts",
  "tests/knowledge-route-scope.test.ts",
  "src/main/knowledge/knowledge-provider-facade.test.ts",
  "src/main/knowledge/knowledge-upload-job-coordinator.test.ts",
]);
