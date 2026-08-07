import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { getModelConfig } from "../config";
import { resolveRuntimePaths } from "./windows/path-resolver";

/** Avoid importing models.ts (top-level HERMES_HOME) — breaks installer init order. */
function hasSavedModelsInFile(): boolean {
  const home = process.env.HERMES_HOME?.trim() || join(homedir(), ".hermes");
  const modelsPath = join(home, "models.json");
  if (!existsSync(modelsPath)) return false;
  try {
    const parsed = JSON.parse(readFileSync(modelsPath, "utf-8")) as unknown;
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

export function hasHermesAuthCredential(provider: string): boolean {
  const { hermesAuthFile } = resolveRuntimePaths();
  if (!provider || !existsSync(hermesAuthFile)) return false;
  try {
    const auth = JSON.parse(readFileSync(hermesAuthFile, "utf-8")) as {
      active_provider?: string;
      credential_pool?: Record<string, unknown[]>;
      providers?: Record<string, unknown>;
    };
    const pool = auth.credential_pool?.[provider];
    if (Array.isArray(pool) && pool.length > 0) return true;
    if (auth.active_provider === provider) return true;
    return Boolean(auth.providers?.[provider]);
  } catch {
    return false;
  }
}

/** Whether local model/provider credentials are configured (Setup gate). */
export function isModelConfigured(): boolean {
  const { hermesEnvFile } = resolveRuntimePaths();

  try {
    const mc = getModelConfig();
    const localProviders = ["custom", "lmstudio", "ollama", "vllm", "llamacpp"];
    if (localProviders.includes(mc.provider) && mc.baseUrl.trim()) {
      return true;
    }
    if (mc.model.trim()) {
      return true;
    }
    if (
      localProviders.includes(mc.provider) ||
      hasHermesAuthCredential(mc.provider)
    ) {
      return true;
    }
  } catch {
    /* ignore */
  }

  if (hasSavedModelsInFile()) {
    return true;
  }

  if (!existsSync(hermesEnvFile)) return false;

  try {
    const content = readFileSync(hermesEnvFile, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) continue;
      const match = trimmed.match(
        /^(OPENROUTER_API_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY)=(.+)$/,
      );
      if (
        match &&
        match[2].trim() &&
        !['""', "''", ""].includes(match[2].trim())
      ) {
        return true;
      }
    }
  } catch {
    /* ignore read errors */
  }

  return false;
}
