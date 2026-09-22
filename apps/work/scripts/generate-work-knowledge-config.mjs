#!/usr/bin/env node
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnvFile } from "./lib/load-dotenv.mjs";
import {
  KNOWLEDGE_CONFIG_FILE,
  prepareKnowledgeBuildConfig,
} from "./lib/work-knowledge-build-config.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadDotEnvFile(join(root, ".env"));

const outputFile = join(root, "resources", KNOWLEDGE_CONFIG_FILE);

try {
  const result = prepareKnowledgeBuildConfig({ outputFile });
  console.log(
    `[generate-work-knowledge-config] prepared ${result.mode} Knowledge resource` +
      (result.mode === "enterprise" ? ` serviceUrl=${result.config.serviceUrl}` : ""),
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Knowledge build config is invalid",
  );
  process.exitCode = 1;
}
