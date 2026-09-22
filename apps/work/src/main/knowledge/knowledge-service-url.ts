/**
 * Knowledge service origin. Pages/features MUST NOT hardcode this URL.
 *
 * Resolve order (no-arg / options form):
 *   1. `SMC_KNOWLEDGE_SERVICE_URL` in process.env (ops / `loadDotEnvForDev`)
 *   2. Packaged build resource `work-knowledge-config.json` (enterprise bake-in)
 *   3. `DEFAULT_KNOWLEDGE_SERVICE_URL` (loopback)
 *
 * Legacy `resolveKnowledgeServiceUrl(envBag)` only consults that bag (tests).
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

export const DEFAULT_KNOWLEDGE_SERVICE_URL = "http://localhost:4530";
export const KNOWLEDGE_CONFIG_FILE = "work-knowledge-config.json";

export interface ResolveKnowledgeServiceUrlOptions {
  env?: NodeJS.ProcessEnv;
  /** Override candidate paths (tests). */
  configPaths?: string[];
  /**
   * When provided, skips filesystem lookup.
   * Pass `null` to force default after env.
   */
  buildConfig?: { serviceUrl?: unknown } | null;
}

function isOptions(
  value: NodeJS.ProcessEnv | ResolveKnowledgeServiceUrlOptions | undefined,
): value is ResolveKnowledgeServiceUrlOptions {
  return (
    !!value &&
    typeof value === "object" &&
    ("env" in value || "configPaths" in value || "buildConfig" in value)
  );
}

function normalizeOrigin(candidate: string): string {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("KNOWLEDGE_SERVICE_URL_INVALID");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("KNOWLEDGE_SERVICE_URL_INVALID");
  }
  return url.origin;
}

function originFromEnv(env: NodeJS.ProcessEnv): string | null {
  const raw = env.SMC_KNOWLEDGE_SERVICE_URL?.trim();
  if (!raw) return null;
  return normalizeOrigin(raw);
}

function defaultConfigPaths(): string[] {
  const paths: string[] = [];
  if (typeof process.resourcesPath === "string" && process.resourcesPath) {
    paths.push(join(process.resourcesPath, KNOWLEDGE_CONFIG_FILE));
    paths.push(join(process.resourcesPath, "resources", KNOWLEDGE_CONFIG_FILE));
  }
  paths.push(join(process.cwd(), "resources", KNOWLEDGE_CONFIG_FILE));
  return [...new Set(paths)];
}

function readBuildServiceUrl(paths: string[]): string | null {
  for (const path of paths) {
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as {
        schemaVersion?: unknown;
        serviceUrl?: unknown;
      };
      if (parsed.schemaVersion !== 1) continue;
      if (typeof parsed.serviceUrl !== "string" || !parsed.serviceUrl.trim()) {
        continue;
      }
      return normalizeOrigin(parsed.serviceUrl);
    } catch {
      continue;
    }
  }
  return null;
}

function originFromBuildConfig(
  buildConfig: { serviceUrl?: unknown } | null,
): string | null {
  if (!buildConfig) return null;
  if (typeof buildConfig.serviceUrl !== "string") return null;
  const trimmed = buildConfig.serviceUrl.trim();
  if (!trimmed) return null;
  return normalizeOrigin(trimmed);
}

/**
 * Resolve Knowledge service origin.
 */
export function resolveKnowledgeServiceUrl(
  envOrOptions?: NodeJS.ProcessEnv | ResolveKnowledgeServiceUrlOptions,
): string {
  // Legacy: explicit ProcessEnv bag — env only (unit tests / injectors).
  if (envOrOptions !== undefined && !isOptions(envOrOptions)) {
    return (
      originFromEnv(envOrOptions) ?? DEFAULT_KNOWLEDGE_SERVICE_URL
    );
  }

  const options: ResolveKnowledgeServiceUrlOptions = isOptions(envOrOptions)
    ? envOrOptions
    : {};
  const env = options.env ?? process.env;

  const fromEnv = originFromEnv(env);
  if (fromEnv) return fromEnv;

  if (options.buildConfig !== undefined) {
    return (
      originFromBuildConfig(options.buildConfig) ??
      DEFAULT_KNOWLEDGE_SERVICE_URL
    );
  }

  const fromBuild = readBuildServiceUrl(
    options.configPaths ?? defaultConfigPaths(),
  );
  if (fromBuild) return fromBuild;

  return DEFAULT_KNOWLEDGE_SERVICE_URL;
}
