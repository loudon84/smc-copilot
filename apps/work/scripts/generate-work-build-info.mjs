#!/usr/bin/env node
/**
 * Generate resources/work-build-info.json for packaged Work identity read-back.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readPackageVersion } from "./lib/work-release-guard.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "resources", "work-build-info.json");

function git(args) {
  return execSync(`git ${args}`, {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

const version = readPackageVersion(join(root, "package.json"));
let gitCommit = "unknown";
let gitBranch = "unknown";
let dirty = false;

try {
  gitCommit = git("rev-parse HEAD");
  gitBranch = git("rev-parse --abbrev-ref HEAD");
  dirty = git("status --porcelain").length > 0;
} catch {
  /* non-git tree */
}

if (process.env.SMC_WORK_BUILD_FAIL_DIRTY === "1") {
  if (dirty) {
    console.error("[generate-work-build-info] Refusing dirty build identity");
    process.exit(1);
  }
  if (!gitCommit || gitCommit === "unknown") {
    console.error("[generate-work-build-info] Refusing unknown git commit");
    process.exit(1);
  }
}

const payload = {
  schema: "smc.work.build.v1",
  version,
  gitCommit,
  gitBranch,
  buildTime: new Date().toISOString(),
  runtimeAdapter: "legacy-local",
  runtimeContract: "managed-local-v1",
  dirty,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`[generate-work-build-info] wrote ${outPath}`);
