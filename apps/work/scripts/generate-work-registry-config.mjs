#!/usr/bin/env node
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  prepareRegistryBuildProfile,
  REGISTRY_BUILD_PROFILE_ENV,
  REGISTRY_CONFIG_FILE,
} from "./lib/work-registry-build-profile.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputFile = join(root, "resources", REGISTRY_CONFIG_FILE);

// PRD-WORK-v2.3.1: no profile selected => keep the committed descriptor
// untouched, same policy as build-work-release.ps1. Deleting it on every
// plain `npm run build` just dirties the git tree; the packaged result is
// identical either way (committed descriptor URLs == built-in public
// default). The library stays fail-closed for explicit/profiled calls.
if (!process.env[REGISTRY_BUILD_PROFILE_ENV]) {
  console.log("[generate-work-registry-config] no profile selected; keeping committed Registry resource");
  process.exit(0);
}

try {
  const result = prepareRegistryBuildProfile({ outputFile });
  console.log(`[generate-work-registry-config] prepared ${result.mode} Registry resource`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Registry build profile is invalid");
  process.exitCode = 1;
}
