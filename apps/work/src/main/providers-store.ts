// @lat: [[provider-setup#Provider setup#LLM-provider keys are configured-only, via modals#Named custom providers]]
import { existsSync, readFileSync } from "fs";
import { randomUUID } from "crypto";
import { join } from "path";
import {
  type CustomProviderFile,
  type CustomProviderRecord,
} from "../shared/custom-providers";
import {
  customProviderEnvKey,
  isDedicatedBrandCustomProvider,
} from "../shared/url-key-map";
import {
  removeAgentCustomProviderEntry,
  removeAgentUserProvider,
  upsertAgentUserProvider,
} from "./agent-config-providers";
import { isValidProfileName, profileHome, safeWriteFile } from "./utils";

// Per-profile store of user-configured custom providers. Sits alongside the
// profile's `.env` (holds the key) and the global `models.json` (holds models);
// this file owns provider *identity* so a card renders as soon as it's saved,
// independent of whether any model has been added yet. Mirrors the shape and
// conventions of `wallet-store.ts` (versioned envelope, atomic writes), but is
// plaintext — it stores no secrets, only a name + base URL.
const PROVIDERS_FILE = "providers.json";

function providersPath(profile?: string): string {
  return join(profileHome(profile), PROVIDERS_FILE);
}

function normalizeProfile(profile?: string): string | undefined {
  const normalized =
    profile === "" || profile === "default" ? undefined : profile;
  if (normalized !== undefined && !isValidProfileName(normalized)) {
    throw new Error("Invalid profile name.");
  }
  return normalized;
}

function isRecord(value: unknown): value is CustomProviderRecord {
  const r = value as Partial<CustomProviderRecord>;
  return (
    !!r &&
    typeof r.id === "string" &&
    typeof r.name === "string" &&
    typeof r.baseUrl === "string" &&
    typeof r.createdAt === "number"
  );
}

function readProvidersFile(profile?: string): CustomProviderFile {
  const file = providersPath(profile);
  if (!existsSync(file)) return { version: 1, providers: [] };
  try {
    const parsed = JSON.parse(
      readFileSync(file, "utf-8"),
    ) as Partial<CustomProviderFile>;
    if (
      !parsed ||
      (parsed.version !== 1 && parsed.version !== 2) ||
      !Array.isArray(parsed.providers)
    ) {
      return { version: 1, providers: [] };
    }
    return { version: 1, providers: parsed.providers.filter(isRecord) };
  } catch {
    // A corrupt file shouldn't wipe the Providers screen — degrade to empty.
    return { version: 1, providers: [] };
  }
}

function writeProvidersFile(
  profile: string | undefined,
  data: CustomProviderFile,
): void {
  safeWriteFile(providersPath(profile), JSON.stringify(data, null, 2));
}

export function readProviderRegistry(profile?: string): CustomProviderFile {
  return readProvidersFile(normalizeProfile(profile));
}

export function writeProviderRegistry(
  profile: string | undefined,
  data: CustomProviderFile,
): void {
  writeProvidersFile(normalizeProfile(profile), data);
}

/** Upsert into providers.json only — no config.yaml mirror. */
function upsertCustomProviderRecordOnly(
  profile: string | undefined,
  input: { name: string; baseUrl: string },
): CustomProviderRecord | null {
  const normalized = normalizeProfile(profile);
  const name = (input.name || "").trim();
  const baseUrl = (input.baseUrl || "").trim();
  if (!name || !baseUrl) return null;

  const anchor = customProviderEnvKey(name);
  const data = readProvidersFile(normalized);
  const existing = data.providers.find(
    (p) => customProviderEnvKey(p.name) === anchor,
  );

  let record: CustomProviderRecord;
  if (existing) {
    if (existing.name === name && existing.baseUrl === baseUrl) {
      return existing; // unchanged — don't rewrite the file on every read
    }
    // Preserve id/createdAt; refresh the display name + base URL.
    existing.name = name;
    existing.baseUrl = baseUrl;
    record = existing;
  } else {
    record = { id: randomUUID(), name, baseUrl, createdAt: Date.now() };
    data.providers.push(record);
  }
  writeProvidersFile(normalized, data);
  return record;
}

/** All custom providers configured for `profile` (empty when none/no file).
 *  Terminal-added providers from the agent's config.yaml are imported first,
 *  so the returned list covers both origins. */
export function listCustomProviders(profile?: string): CustomProviderRecord[] {
  const normalized = normalizeProfile(profile);
  // P0.1-D-16: this call is a pure read. Registry intake happens only through
  // saveNamedProvider(), not through listing.
  return readProvidersFile(normalized).providers.filter(
    (p) => !isDedicatedBrandCustomProvider(p.name, p.baseUrl),
  );
}

/**
 * Create or update a custom provider by identity. Records are keyed by their
 * derived env-key name (`customProviderEnvKey(name)`) — the same anchor the
 * runtime uses to look the API key back up — so a re-save with the same name
 * updates the base URL in place instead of duplicating. Blank name or base URL
 * is a no-op (nothing durable to record yet).
 */
export function upsertCustomProvider(
  profile: string | undefined,
  input: { name: string; baseUrl: string },
): CustomProviderRecord | null {
  const normalized = normalizeProfile(profile);
  const record = upsertCustomProviderRecordOnly(normalized, input);
  if (record) {
    // Mirror into the agent's config.yaml `providers:` dict so the terminal
    // CLI (`hermes model`, `--provider <slug>`) sees the same provider. A
    // terminal-origin entry is matched by its key_env/slug and patched in
    // place, so this never duplicates.
    try {
      upsertAgentUserProvider(normalized, {
        name: record.name,
        baseUrl: record.baseUrl,
        keyEnv: customProviderEnvKey(record.name),
      });
    } catch {
      /* config.yaml unwritable — the desktop store is still consistent */
    }
  }
  return record;
}

/** Remove a custom provider by name (matched via its derived env-key anchor).
 *  Also removes the mirrored/originating entry from the agent's config.yaml
 *  (both the `providers:` dict and the legacy `custom_providers:` list) so
 *  the next read doesn't re-import it. */
export function removeCustomProvider(
  profile: string | undefined,
  name: string,
): void {
  const normalized = normalizeProfile(profile);
  const trimmed = (name || "").trim();
  const anchor = customProviderEnvKey(trimmed);
  const data = readProvidersFile(normalized);
  const next = data.providers.filter(
    (p) => customProviderEnvKey(p.name) !== anchor,
  );
  if (next.length !== data.providers.length) {
    writeProvidersFile(normalized, { version: data.version, providers: next });
  }
  try {
    removeAgentUserProvider(normalized, { name: trimmed, keyEnv: anchor });
    removeAgentCustomProviderEntry(normalized, trimmed);
  } catch {
    /* best-effort — a stale config.yaml entry re-imports harmlessly */
  }
}
