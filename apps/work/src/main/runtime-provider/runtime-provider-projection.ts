import { existsSync, readFileSync, unlinkSync } from "fs";
import { randomUUID } from "crypto";
import { join } from "path";
import { upsertAgentUserProvider } from "../agent-config-providers";
import {
  getModelConfig,
  removeBlockChild,
  setModelConfig,
} from "../config";
import { readModelsRaw, writeModels, type SavedModelRow } from "../models";
import {
  readProviderRegistry,
  writeProviderRegistry,
} from "../providers-store";
import {
  listSessionModelOverrides,
  setSessionModelOverride,
} from "../session-model-override-store";
import { listSessionProfileIds } from "../session-metadata-store";
import { profileHome, profilePaths, safeWriteFile } from "../utils";
import { auxiliaryAdoptionPath } from "./runtime-provider-auxiliary-adoption";
import { logRuntimeProviderOperation } from "./runtime-provider-observability";
import {
  NODESKCLAW_API_MODE,
  NODESKCLAW_DISPLAY_NAME,
  NODESKCLAW_KEY_ENV,
  NODESKCLAW_PROVIDER_KEY,
  NODESKCLAW_PROVIDER_REF,
  type ManagedModelContract,
} from "./runtime-provider-contract";

const ADOPTION_FILE = "runtime-provider-adoption.json";

export interface ManagedProjectionInput {
  baseUrl: string;
  defaultModel: string;
  models: ManagedModelContract[];
}

export interface ManagedFileSnapshot {
  profile: string | undefined;
  config: string | null;
  providers: string | null;
  models: string | null;
  adoption: string | null;
  auxiliarySidecar?: string | null;
}

function profileForFiles(profile?: string): string | undefined {
  const value = (profile || "").trim();
  if (!value || value === "default") return undefined;
  return value;
}

function adoptionPath(profile?: string): string {
  return join(profileHome(profileForFiles(profile)), ADOPTION_FILE);
}

function readOptional(path: string): string | null {
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8");
}

export function captureManagedFiles(profile?: string): ManagedFileSnapshot {
  const normalized = profileForFiles(profile);
  const { configFile } = profilePaths(normalized);
  const providersFile = join(profileHome(normalized), "providers.json");
  const modelsFile = join(profileHome(normalized), "models.json");
  return {
    profile: normalized,
    config: readOptional(configFile),
    providers: readOptional(providersFile),
    models: readOptional(modelsFile),
    adoption: readOptional(adoptionPath(normalized)),
    auxiliarySidecar: readOptional(auxiliaryAdoptionPath(normalized)),
  };
}

export function restoreManagedFiles(snapshot: ManagedFileSnapshot): void {
  const { configFile } = profilePaths(snapshot.profile);
  const home = profileHome(snapshot.profile);
  const writeOrLeave = (path: string, content: string | null): void => {
    if (content == null) {
      if (existsSync(path)) unlinkSync(path);
      return;
    }
    safeWriteFile(path, content);
  };
  writeOrLeave(configFile, snapshot.config);
  writeOrLeave(join(home, "providers.json"), snapshot.providers);
  writeOrLeave(join(home, "models.json"), snapshot.models);
  writeOrLeave(adoptionPath(snapshot.profile), snapshot.adoption);
  if (snapshot.auxiliarySidecar !== undefined) {
    writeOrLeave(auxiliaryAdoptionPath(snapshot.profile), snapshot.auxiliarySidecar);
  }
}

export function detectManagedIdentityConflict(profile?: string): boolean {
  const normalized = profileForFiles(profile);
  const registry = readProviderRegistry(normalized);
  return registry.providers.some((row) => {
    const ownsKey = row.providerKey === NODESKCLAW_PROVIDER_KEY;
    const ownsEnv = row.keyEnv === NODESKCLAW_KEY_ENV;
    if (ownsKey && row.keyEnv && row.keyEnv !== NODESKCLAW_KEY_ENV) return true;
    if (ownsEnv && row.providerKey && row.providerKey !== NODESKCLAW_PROVIDER_KEY) {
      return true;
    }
    return false;
  });
}

export function readAdoption(profile?: string): { provider: string; model: string } | null {
  const raw = readOptional(adoptionPath(profile));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { provider?: unknown; model?: unknown };
    if (typeof parsed.provider !== "string" || typeof parsed.model !== "string") {
      return null;
    }
    return { provider: parsed.provider, model: parsed.model };
  } catch {
    return null;
  }
}

export function adoptionContainsSecret(profile?: string): boolean {
  const raw = readOptional(adoptionPath(profile));
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.keys(parsed).some((key) =>
      /secret|api_key|authorization|token|fingerprint/i.test(key),
    );
  } catch {
    return true;
  }
}

export function normalizeRuntimeProfileId(profile?: string): string {
  const value = (profile || "default").trim();
  return value || "default";
}

export function sessionOverrideBelongsToOtherProfile(
  profileIds: string[],
  target?: string,
): boolean {
  const ids = profileIds.map((value) => normalizeRuntimeProfileId(value));
  if (ids.length === 0) return false;
  return !ids.includes(normalizeRuntimeProfileId(target));
}

export function captureRewritableSessionOverrides(profile?: string): Array<{
  sessionId: string;
  override: ReturnType<typeof listSessionModelOverrides>[number]["override"];
}> {
  return listSessionModelOverrides().filter(
    (row) =>
      !sessionOverrideBelongsToOtherProfile(
        listSessionProfileIds(row.sessionId),
        profile,
      ),
  );
}

export function restoreSessionOverrides(
  rows: Array<{
    sessionId: string;
    override: ReturnType<typeof listSessionModelOverrides>[number]["override"];
  }>,
): void {
  for (const row of rows) {
    setSessionModelOverride(row.sessionId, row.override);
  }
}

function rememberAdoption(profile: string | undefined): void {
  const current = getModelConfig(profile);
  if (current.provider === NODESKCLAW_PROVIDER_KEY) {
    // Never write nodeskclaw as the "original" provider. Missing sidecar is
    // a diagnostic only — logout will leave model.provider as nodeskclaw.
    if (!existsSync(adoptionPath(profile))) {
      logRuntimeProviderOperation({
        stage: "ADOPTION",
        status: "PASS",
        message: "skip_active_model_adoption_already_nodeskclaw",
        profile: profileForFiles(profile) || "default",
        provider: current.provider,
      });
    }
    return;
  }
  safeWriteFile(
    adoptionPath(profile),
    JSON.stringify({ provider: current.provider, model: current.model }),
  );
}

export function restoreAdoptedActiveModel(profile?: string): void {
  const normalized = profileForFiles(profile);
  const current = getModelConfig(normalized);
  if (current.provider !== NODESKCLAW_PROVIDER_KEY) return;
  const saved = readAdoption(normalized);
  if (!saved) return;
  setModelConfig(saved.provider, saved.model, "", normalized);
}

export function projectManagedRuntime(
  profile: string | undefined,
  input: ManagedProjectionInput,
): { ok: true } | { ok: false; error: "MANAGED_PROVIDER_IDENTITY_CONFLICT" } {
  const normalized = profileForFiles(profile);
  const step = (name: string): void => {
    console.info(
      JSON.stringify({
        event: "runtime_provider_project_step",
        step: name,
        profile: normalized || "default",
      }),
    );
  };
  step("identity_check");
  if (detectManagedIdentityConflict(normalized)) {
    return { ok: false, error: "MANAGED_PROVIDER_IDENTITY_CONFLICT" };
  }
  step("adoption");
  rememberAdoption(normalized);
  step("upsert_yaml_provider");
  upsertAgentUserProvider(normalized, {
    name: NODESKCLAW_DISPLAY_NAME,
    baseUrl: input.baseUrl,
    keyEnv: NODESKCLAW_KEY_ENV,
    apiMode: NODESKCLAW_API_MODE,
    slug: NODESKCLAW_PROVIDER_KEY,
  });
  step("registry_write");
  const registry = readProviderRegistry(normalized);
  const existing = registry.providers.find(
    (row) => row.providerKey === NODESKCLAW_PROVIDER_KEY,
  );
  const record = {
    id: existing?.id || randomUUID(),
    name: NODESKCLAW_DISPLAY_NAME,
    baseUrl: input.baseUrl,
    createdAt: existing?.createdAt || Date.now(),
    providerKey: NODESKCLAW_PROVIDER_KEY,
    keyEnv: NODESKCLAW_KEY_ENV,
    apiMode: NODESKCLAW_API_MODE,
    updatedAt: Date.now(),
  };
  const providers = registry.providers.filter(
    (row) => row.providerKey !== NODESKCLAW_PROVIDER_KEY,
  );
  providers.push(record);
  writeProviderRegistry(normalized, { version: 2, providers });

  step("models_write");
  const rows = readModelsRaw(normalized).filter(
    (row) => row.providerRef !== NODESKCLAW_PROVIDER_REF,
  );
  const managed: SavedModelRow[] = input.models.map((model) => ({
    id: `nodeskclaw:${model.id}`,
    name: model.displayName,
    provider: NODESKCLAW_PROVIDER_KEY,
    model: model.id,
    baseUrl: input.baseUrl,
    providerLabel: NODESKCLAW_DISPLAY_NAME,
    providerRef: NODESKCLAW_PROVIDER_REF,
    createdAt: Date.now(),
  }));
  writeModels([...rows, ...managed], normalized);
  step("active_model");
  setModelConfig(NODESKCLAW_PROVIDER_KEY, input.defaultModel, "", normalized);
  const { configFile } = profilePaths(normalized);
  if (existsSync(configFile)) {
    safeWriteFile(
      configFile,
      removeBlockChild(readFileSync(configFile, "utf-8"), "model", "base_url"),
    );
  }
  step("session_overrides");
  const allowed = new Set(input.models.map((model) => model.id));
  for (const row of listSessionModelOverrides()) {
    if (
      sessionOverrideBelongsToOtherProfile(
        listSessionProfileIds(row.sessionId),
        normalized,
      )
    ) {
      continue;
    }
    if (
      row.override.providerRef === NODESKCLAW_PROVIDER_REF &&
      allowed.has(row.override.model)
    ) {
      continue;
    }
    setSessionModelOverride(row.sessionId, {
      provider: NODESKCLAW_PROVIDER_KEY,
      model: input.defaultModel,
      baseUrl: "",
      providerRef: NODESKCLAW_PROVIDER_REF,
      migrationStatus: "canonical",
    });
  }
  step("done");
  return { ok: true };
}
