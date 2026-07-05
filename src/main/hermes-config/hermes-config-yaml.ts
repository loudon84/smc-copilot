import { existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";
import { profileHome, safeWriteFile } from "../utils";
import {
  ensureModelsApiKeyEnvPersisted,
  listModels,
  resolveSavedModelById,
  type SavedModel,
} from "../models";
import { invalidateModelConfigCache, readEnv } from "../config";
import {
  resolveApiKeyEnvForBaseUrl,
  resolveApiKeyForSavedModel,
} from "../hermes-model-env";

export type HermesCustomProvider = {
  name: string;
  base_url: string;
  model: string;
  key_env?: string;
  api_key?: string;
};

export type HermesConfigDocument = Record<string, unknown> & {
  provider?: string;
  default?: string;
  model?: {
    provider?: string;
    default?: string;
    base_url?: string;
  };
  platforms?: {
    api_server?: {
      host?: string;
      port?: number;
    };
  };
  smart_model_routing?: {
    enabled: boolean;
  };
  streaming?: boolean;
  custom_providers?: HermesCustomProvider[];
  mcp_servers?: Record<string, unknown>;
};

function configFilePath(profile?: string): string {
  return join(profileHome(profile), "config.yaml");
}

function ensureConfigFile(profile?: string): string {
  const home = profileHome(profile);
  const configFile = join(home, "config.yaml");
  if (!existsSync(configFile)) {
    if (!existsSync(home)) {
      mkdirSync(home, { recursive: true });
    }
    const template = `provider: "auto"
default: ""

platforms:
  api_server:
    host: "127.0.0.1"
    port: 8642

smart_model_routing:
  enabled: false

streaming: true
`;
    safeWriteFile(configFile, template);
  }
  return configFile;
}

export function readHermesConfig(profile?: string): HermesConfigDocument {
  const configFile = ensureConfigFile(profile);
  const raw = readFileSync(configFile, "utf-8");
  const doc = yaml.load(raw);
  if (doc && typeof doc === "object" && !Array.isArray(doc)) {
    return doc as HermesConfigDocument;
  }
  return {};
}

export function writeHermesConfig(
  profile: string | undefined,
  doc: HermesConfigDocument,
): void {
  const configFile = ensureConfigFile(profile);
  safeWriteFile(configFile, yaml.dump(doc, { lineWidth: -1, noRefs: true }));
  invalidateModelConfigCache(profile);
}

export function buildCustomProviderEntry(
  model: SavedModel,
  profile?: string,
): HermesCustomProvider {
  const entry: HermesCustomProvider = {
    name: model.model,
    base_url: model.baseUrl.replace(/\/+$/, ""),
    model: model.model,
  };

  const envKey =
    model.apiKeyEnv?.trim() || resolveApiKeyEnvForBaseUrl(model.baseUrl);
  // Bare env var name — Hermes runtime uses os.getenv(key_env). `${VAR}` in YAML
  // is expanded by load_config() and breaks getenv-based resolution.
  if (envKey) {
    entry.key_env = envKey;
  }

  const profileEnv = readEnv(profile);
  const resolvedKey = resolveApiKeyForSavedModel(model, profileEnv);
  if (resolvedKey) {
    entry.api_key = resolvedKey;
  } else if (model.apiKeyLiteral?.trim()) {
    entry.api_key = model.apiKeyLiteral.trim();
  }

  return entry;
}

function buildCustomProvidersFromModels(profile?: string): HermesCustomProvider[] {
  return listModels().map((m) => buildCustomProviderEntry(m, profile));
}

/**
 * Align Gateway runtime `model:` section with the session-selected SavedModel.
 * Does **not** change root `default:` (Models 页 Set Default 仍由 `setDefaultHermesModel` 负责).
 * Hermes API Server 每次创建 Agent 会重读 config.yaml（mtime 缓存），无需 restart Gateway。
 */
export function overlayGatewayModelSectionForSession(
  profile: string | undefined,
  saved: SavedModel,
): boolean {
  const doc = readHermesConfig(profile);
  const baseUrl = saved.baseUrl.replace(/\/+$/, "");
  let provider = saved.provider?.trim() || "custom";
  if (provider === "auto" && baseUrl) {
    provider = "custom";
  }

  const current =
    doc.model && typeof doc.model === "object" && !Array.isArray(doc.model)
      ? doc.model
      : {};
  const same =
    current.provider === provider &&
    current.default === saved.model &&
    (current.base_url || "") === baseUrl;
  if (same) return false;

  doc.model = {
    provider,
    default: saved.model,
    ...(baseUrl ? { base_url: baseUrl } : {}),
  };
  writeHermesConfig(profile, doc);
  return true;
}

/** @returns true when `custom_providers` in config.yaml was updated */
export function syncCustomProvidersFromModels(profile?: string): boolean {
  ensureModelsApiKeyEnvPersisted();
  const doc = readHermesConfig(profile);
  const before = JSON.stringify(doc.custom_providers ?? []);
  doc.custom_providers = buildCustomProvidersFromModels(profile);
  const after = JSON.stringify(doc.custom_providers ?? []);
  if (before === after) return false;
  writeHermesConfig(profile, doc);
  return true;
}

export function setDefaultHermesModel(
  profile: string | undefined,
  modelId: string,
): void {
  const saved = resolveSavedModelById(modelId);
  if (!saved) {
    throw new Error(`Model not found: ${modelId}`);
  }

  const doc = readHermesConfig(profile);
  const baseUrl = saved.baseUrl.replace(/\/+$/, "");

  doc.provider = "custom";
  doc.default = saved.model;

  doc.model = {
    provider: "custom",
    default: saved.model,
    base_url: baseUrl,
  };

  doc.platforms = {
    ...(doc.platforms ?? {}),
    api_server: {
      host: "127.0.0.1",
      port: 8642,
    },
  };

  doc.smart_model_routing = { enabled: false };
  doc.streaming = true;
  doc.custom_providers = buildCustomProvidersFromModels();

  writeHermesConfig(profile, doc);

  console.log("[Hermes Models] set_default=true");
  console.log(`[Hermes Models] model=${saved.model}`);
  console.log("[Hermes Models] config_write=true");
  console.log("[Hermes Models] custom_providers_sync=true");
}
