import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const KNOWLEDGE_SERVICE_URL_ENV = "SMC_KNOWLEDGE_SERVICE_URL";
export const KNOWLEDGE_CONFIG_FILE = "work-knowledge-config.json";
export const KNOWLEDGE_BUILD_CONFIG_ERROR = "Knowledge build config is invalid";

function invalidConfig() {
  throw new Error(KNOWLEDGE_BUILD_CONFIG_ERROR);
}

/**
 * Normalize a Knowledge service URL to its origin (http/https only).
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeKnowledgeServiceUrl(value) {
  if (typeof value !== "string" || !value.trim()) invalidConfig();
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    invalidConfig();
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") invalidConfig();
  if (url.username || url.password) invalidConfig();
  return url.origin;
}

function clearOutput(outputFile) {
  try {
    if (existsSync(outputFile)) rmSync(outputFile, { recursive: true, force: true });
  } catch {
    invalidConfig();
  }
}

/**
 * When SMC_KNOWLEDGE_SERVICE_URL is unset → community (delete output).
 * When set → write schemaVersion 1 resource with serviceUrl origin.
 *
 * @param {{ serviceUrl?: string, outputFile: string }} options
 * @returns {{ mode: "community" } | { mode: "enterprise", config: { schemaVersion: 1, serviceUrl: string } }}
 */
export function prepareKnowledgeBuildConfig({
  serviceUrl = process.env[KNOWLEDGE_SERVICE_URL_ENV],
  outputFile,
} = {}) {
  if (typeof outputFile !== "string" || !outputFile) invalidConfig();
  clearOutput(outputFile);

  if (serviceUrl === undefined || serviceUrl === null || String(serviceUrl).trim() === "") {
    return { mode: "community" };
  }

  const origin = normalizeKnowledgeServiceUrl(serviceUrl);
  const config = { schemaVersion: 1, serviceUrl: origin };

  try {
    mkdirSync(dirname(outputFile), { recursive: true });
    writeFileSync(outputFile, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  } catch {
    clearOutput(outputFile);
    invalidConfig();
  }
  return { mode: "enterprise", config };
}
