#!/usr/bin/env node
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareRegistryBuildProfile, REGISTRY_CONFIG_FILE } from "./lib/work-registry-build-profile.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputFile = join(root, "resources", REGISTRY_CONFIG_FILE);

try {
  const result = prepareRegistryBuildProfile({ outputFile });
  console.log(`[generate-work-registry-config] prepared ${result.mode} Registry resource`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Registry build profile is invalid");
  process.exitCode = 1;
}
