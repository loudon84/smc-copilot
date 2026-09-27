import { existsSync, readFileSync, rmSync } from "fs";
import { randomUUID } from "crypto";
import { join } from "path";
import type {
  CustomProviderRecord,
  ProviderApiMode,
} from "../../shared/custom-providers";
import {
  checkProviderProjection,
  listAgentUserProviders,
  listLegacyCustomProviders,
  upsertAgentUserProvider,
} from "../agent-config-providers";
import { setEnvValue } from "../config";
import { readProviderRegistry, writeProviderRegistry } from "../providers-store";
import { generateProviderKey, providerKeyEnv } from "./provider-ref";
import {
  isValidProfileName,
  profilePaths,
  safeWriteFile,
} from "../utils";

export type SaveNamedProviderError =
  | "PROVIDER_KEY_CONFLICT"
  | "PROVIDER_KEYENV_CONFLICT"
  | "PROVIDER_API_MODE_INVALID"
  | "PROFILE_SCOPE_MISMATCH"
  | "PROVIDER_SAVE_ROLLBACK_FAILED"
  | "PROVIDER_SAVE_TRANSACTION_FAILED"
  | "PROVIDER_PROJECTION_DRIFT";

export type SaveNamedProviderResult =
  | { ok: true; record: CustomProviderRecord }
  | { ok: false; error: SaveNamedProviderError };

export type SaveNamedProviderInput = {
  profile: string;
  name: string;
  baseUrl: string;
  apiMode?: string;
  /** Omit to derive or keep an existing key_env. Empty string means no secret. */
  keyEnv?: string;
  /** Written only to profile `.env`. Never copied into json or yaml. */
  secret?: string;
  /** Existing record id. A later display-name change keeps its providerKey. */
  id?: string;
};

type FileSnapshot = {
  providersPath: string;
  envPath: string;
  configPath: string;
  providers?: string;
  env?: string;
  config?: string;
};

const API_MODES = new Set<ProviderApiMode>([
  "chat_completions",
  "anthropic_messages",
]);

function explicitProfile(
  profile: string,
): { ok: true; profile: string | undefined } | { ok: false; error: "PROFILE_SCOPE_MISMATCH" } {
  void process.env.HERMES_PROFILE;
  if (profile === "default") return { ok: true, profile: undefined };
  if (!isValidProfileName(profile)) {
    return { ok: false, error: "PROFILE_SCOPE_MISMATCH" };
  }
  return { ok: true, profile };
}

function snapshotOf(profile: string | undefined): FileSnapshot {
  const paths = profilePaths(profile);
  const providersPath = join(paths.home, "providers.json");
  return {
    providersPath,
    envPath: paths.envFile,
    configPath: paths.configFile,
    providers: existsSync(providersPath)
      ? readFileSync(providersPath, "utf-8")
      : undefined,
    env: existsSync(paths.envFile)
      ? readFileSync(paths.envFile, "utf-8")
      : undefined,
    config: existsSync(paths.configFile)
      ? readFileSync(paths.configFile, "utf-8")
      : undefined,
  };
}

function restoreSnapshot(snapshot: FileSnapshot): void {
  const restore = (file: string, content: string | undefined): void => {
    if (content === undefined) {
      if (existsSync(file)) rmSync(file);
      return;
    }
    safeWriteFile(file, content);
  };
  restore(snapshot.providersPath, snapshot.providers);
  restore(snapshot.envPath, snapshot.env);
  restore(snapshot.configPath, snapshot.config);
}

function parseApiMode(
  value: string | undefined,
): ProviderApiMode | "PROVIDER_API_MODE_INVALID" {
  const mode = (value || "chat_completions") as ProviderApiMode;
  if (!API_MODES.has(mode)) return "PROVIDER_API_MODE_INVALID";
  return mode;
}

function existingYamlKeyEnv(
  profile: string | undefined,
  providerKey: string,
  name: string,
): string | undefined {
  const fromNamed = listAgentUserProviders(profile).find(
    (entry) => entry.slug === providerKey,
  );
  if (fromNamed?.keyEnv) return fromNamed.keyEnv;
  const fromLegacy = listLegacyCustomProviders(profile).find(
    (entry) => entry.name === name || entry.name === providerKey,
  );
  return fromLegacy?.keyEnv || undefined;
}

function chooseKeyEnv(input: {
  profile: string | undefined;
  providerKey: string;
  name: string;
  requested?: string;
  registry: CustomProviderRecord[];
}): { ok: true; keyEnv: string } | { ok: false; error: "PROVIDER_KEYENV_CONFLICT" } {
  const kept = existingYamlKeyEnv(input.profile, input.providerKey, input.name);
  const keyEnv =
    kept ??
    (input.requested !== undefined
      ? input.requested
      : providerKeyEnv(input.providerKey));
  if (keyEnv) {
    const owner = input.registry.find(
      (record) =>
        record.providerKey &&
        record.providerKey !== input.providerKey &&
        record.keyEnv === keyEnv,
    );
    if (owner) return { ok: false, error: "PROVIDER_KEYENV_CONFLICT" };
  }
  return { ok: true, keyEnv };
}

export function saveNamedProvider(
  input: SaveNamedProviderInput,
  deps?: { project?: typeof upsertAgentUserProvider },
): SaveNamedProviderResult {
  const scoped = explicitProfile(input.profile);
  if (!scoped.ok) return scoped;
  const profile = scoped.profile;
  const apiMode = parseApiMode(input.apiMode);
  if (apiMode === "PROVIDER_API_MODE_INVALID") {
    return { ok: false, error: apiMode };
  }
  const name = input.name.trim();
  const baseUrl = input.baseUrl.trim();
  if (!name || !baseUrl) return { ok: false, error: "PROFILE_SCOPE_MISMATCH" };

  const before = snapshotOf(profile);
  try {
    const registry = readProviderRegistry(profile);
    const existing = input.id
      ? registry.providers.find((record) => record.id === input.id)
      : undefined;
    let providerKey = existing?.providerKey;
    if (!providerKey) {
      const generated = generateProviderKey(
        name,
        existing?.id || randomUUID(),
        registry.providers
          .map((record) => record.providerKey)
          .filter((key): key is string => !!key),
      );
      if (!generated.ok) return generated;
      providerKey = generated.providerKey;
    }
    const keyEnv = chooseKeyEnv({
      profile,
      providerKey,
      name,
      requested: input.keyEnv,
      registry: registry.providers,
    });
    if (!keyEnv.ok) return keyEnv;

    const now = Date.now();
    const record: CustomProviderRecord = {
      id: existing?.id || input.id || randomUUID(),
      name,
      baseUrl,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      providerKey,
      keyEnv: keyEnv.keyEnv,
      apiMode,
    };
    const providers = registry.providers.filter((row) => row.id !== record.id);
    providers.push(record);
    writeProviderRegistry(profile, { version: 2, providers });
    if (keyEnv.keyEnv && input.secret !== undefined) {
      setEnvValue(keyEnv.keyEnv, input.secret, profile);
    }
    const project = deps?.project ?? upsertAgentUserProvider;
    project(profile, {
      name,
      baseUrl,
      keyEnv: keyEnv.keyEnv,
      slug: providerKey,
      apiMode,
    });
    const projected = readProviderRegistry(profile).providers.find(
      (row) => row.id === record.id,
    );
    if (!projected || projected.providerKey !== providerKey) {
      throw new Error("PROVIDER_SAVE_TRANSACTION_FAILED");
    }
    const semantic = checkProviderProjection(profile, {
      providerKey,
      baseUrl,
      keyEnv: keyEnv.keyEnv,
      apiMode,
    });
    if (!semantic.ok) throw new Error("PROVIDER_PROJECTION_DRIFT");
    return { ok: true, record };
  } catch (error) {
    try {
      restoreSnapshot(before);
    } catch {
      return { ok: false, error: "PROVIDER_SAVE_ROLLBACK_FAILED" };
    }
    if (error instanceof Error && error.message === "PROVIDER_PROJECTION_DRIFT") {
      return { ok: false, error: "PROVIDER_PROJECTION_DRIFT" };
    }
    return { ok: false, error: "PROVIDER_SAVE_TRANSACTION_FAILED" };
  }
}

export function migrateRegistryToV2(
  profile: string,
): SaveNamedProviderResult[] {
  const scoped = explicitProfile(profile);
  if (!scoped.ok) return [scoped];
  const registry = readProviderRegistry(scoped.profile);
  const results: SaveNamedProviderResult[] = [];
  for (const row of registry.providers) {
    if (row.providerKey && row.apiMode) {
      results.push({ ok: true, record: row });
      continue;
    }
    results.push(
      saveNamedProvider({
        profile,
        id: row.id,
        name: row.name,
        baseUrl: row.baseUrl,
        apiMode: row.apiMode,
        keyEnv: row.keyEnv,
      }),
    );
  }
  return results;
}
