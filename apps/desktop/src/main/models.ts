import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { randomUUID } from "crypto";
import { safeWriteFile } from "./utils";
import DEFAULT_MODELS from "./default-models";
import { resolveApiKeyEnvForBaseUrl } from "./hermes-model-env";

function modelsFilePath(): string {
  const home = process.env.HERMES_HOME?.trim() || join(homedir(), ".hermes");
  return join(home, "models.json");
}

export interface SavedModel {
  id: string;
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  apiKeyEnv?: string;
  apiKeyLiteral?: string;
  createdAt: number;
  updatedAt?: number;
}

export type SavedModelInputFields = Partial<
  Pick<SavedModel, "name" | "provider" | "model" | "baseUrl" | "apiKeyEnv" | "apiKeyLiteral">
>;

function readModels(): SavedModel[] {
  try {
    const path = modelsFilePath();
    if (!existsSync(path)) return [];
    return JSON.parse(readFileSync(path, "utf-8")) as SavedModel[];
  } catch {
    return [];
  }
}

function writeModels(models: SavedModel[]): void {
  safeWriteFile(modelsFilePath(), JSON.stringify(models, null, 2));
}

function seedDefaults(): SavedModel[] {
  const models: SavedModel[] = DEFAULT_MODELS.map((m) => ({
    id: randomUUID(),
    name: m.name,
    provider: m.provider,
    model: m.model,
    baseUrl: m.baseUrl,
    createdAt: Date.now(),
  }));
  writeModels(models);
  return models;
}

export function listModels(): SavedModel[] {
  if (!existsSync(modelsFilePath())) {
    return seedDefaults();
  }
  return readModels();
}

/** Backfill `apiKeyEnv` from base URL for legacy models.json entries. */
export function ensureModelsApiKeyEnvPersisted(): boolean {
  const models = readModels();
  let changed = false;
  const next = models.map((m) => {
    if (m.apiKeyEnv?.trim() || !m.baseUrl?.trim()) {
      return m;
    }
    const inferred = resolveApiKeyEnvForBaseUrl(m.baseUrl);
    if (!inferred) return m;
    changed = true;
    return { ...m, apiKeyEnv: inferred, updatedAt: Date.now() };
  });
  if (changed) {
    writeModels(next);
  }
  return changed;
}

export function resolveSavedModelById(id: string): SavedModel | null {
  return listModels().find((m) => m.id === id) ?? null;
}

export function addModel(
  name: string,
  provider: string,
  model: string,
  baseUrl: string,
  opts?: { apiKeyEnv?: string; apiKeyLiteral?: string },
): SavedModel {
  const models = readModels();

  const existing = models.find(
    (m) => m.model === model && m.provider === provider,
  );
  if (existing) return existing;

  const now = Date.now();
  const entry: SavedModel = {
    id: randomUUID(),
    name,
    provider,
    model,
    baseUrl: baseUrl || "",
    apiKeyEnv: opts?.apiKeyEnv?.trim() || undefined,
    apiKeyLiteral: opts?.apiKeyLiteral?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  models.push(entry);
  writeModels(models);
  return entry;
}

export function removeModel(id: string): boolean {
  const models = readModels();
  const filtered = models.filter((m) => m.id !== id);
  if (filtered.length === models.length) return false;
  writeModels(filtered);
  return true;
}

export function updateModel(id: string, fields: SavedModelInputFields): boolean {
  const models = readModels();
  const idx = models.findIndex((m) => m.id === id);
  if (idx === -1) return false;
  models[idx] = {
    ...models[idx],
    ...fields,
    updatedAt: Date.now(),
  };
  writeModels(models);
  return true;
}
