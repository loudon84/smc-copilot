import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { HERMES_HOME } from "./installer";
import { profileHome, escapeRegex, safeWriteFile } from "./utils";
import { assertLegacyYamlControlPlane } from "./runtime-adapters/config-control";

// ── Connection Config (local / remote / ssh) ─────────────

export interface SshConnectionConfig {
  host: string;
  port: number;
  username: string;
  keyPath: string;
  remotePort: number;
  localPort: number;
}

export interface ConnectionConfig {
  mode: "local" | "remote" | "ssh";
  remoteUrl: string;
  apiKey: string;
  ssh: SshConnectionConfig;
}

/** Renderer-safe connection snapshot (no raw API key). */
export interface PublicConnectionConfig {
  mode: "local" | "remote" | "ssh";
  remoteUrl: string;
  hasApiKey: boolean;
  apiKeyLength: number;
  ssh: SshConnectionConfig;
}

// Lazy getter — avoids circular dependency with installer.ts
// (HERMES_HOME may not be assigned yet when this module first loads)
function desktopConfigFile(): string {
  return join(HERMES_HOME, "desktop.json");
}

function readDesktopConfig(): Record<string, unknown> {
  try {
    const f = desktopConfigFile();
    if (!existsSync(f)) return {};
    return JSON.parse(readFileSync(f, "utf-8"));
  } catch {
    return {};
  }
}

function writeDesktopConfig(data: Record<string, unknown>): void {
  if (!existsSync(HERMES_HOME)) {
    mkdirSync(HERMES_HOME, { recursive: true });
  }
  writeFileSync(desktopConfigFile(), JSON.stringify(data, null, 2), "utf-8");
}

function readFullConnectionConfig(): ConnectionConfig {
  const data = readDesktopConfig();
  const ssh = (data.sshConfig as Partial<SshConnectionConfig>) ?? {};
  return {
    mode: (data.connectionMode as "local" | "remote" | "ssh") || "local",
    remoteUrl: (data.remoteUrl as string) || "",
    apiKey: (data.remoteApiKey as string) || "",
    ssh: {
      host: (ssh.host as string) || "",
      port: (ssh.port as number) || 22,
      username: (ssh.username as string) || "",
      keyPath: (ssh.keyPath as string) || "",
      remotePort: (ssh.remotePort as number) || 8642,
      localPort: (ssh.localPort as number) || 18642,
    },
  };
}

/** IPC / Renderer: mask metadata only, never the stored key. */
export function getConnectionConfig(): PublicConnectionConfig {
  const full = readFullConnectionConfig();
  const len = full.apiKey.length;
  return {
    mode: full.mode,
    remoteUrl: full.remoteUrl,
    hasApiKey: len > 0,
    apiKeyLength: len,
    ssh: full.ssh,
  };
}

/** Main-process callers that need the stored remote API key. */
export function getFullConnectionConfig(): ConnectionConfig {
  return readFullConnectionConfig();
}

export function setConnectionConfig(config: ConnectionConfig): void {
  const data = readDesktopConfig();
  data.connectionMode = config.mode;
  data.remoteUrl = config.remoteUrl;
  data.remoteApiKey = config.apiKey;
  if (config.mode === "ssh") {
    data.sshConfig = config.ssh;
  }
  writeDesktopConfig(data);
}

// ── In-memory cache with TTL ─────────────────────────────
const CACHE_TTL = 5000; // 5 seconds
const _cache = new Map<string, { data: unknown; ts: number }>();

function getCached<T>(key: string): T | undefined {
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL) {
    _cache.delete(key);
    return undefined;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  _cache.set(key, { data, ts: Date.now() });
}

function invalidateCache(prefix: string): void {
  for (const key of _cache.keys()) {
    if (key.startsWith(prefix)) _cache.delete(key);
  }
}

/** Called after full config.yaml rewrites (e.g. hermes-config-yaml). */
export function invalidateModelConfigCache(profile?: string): void {
  invalidateCache(`mc:${profile || "default"}`);
}

function profilePaths(profile?: string): {
  envFile: string;
  configFile: string;
  home: string;
} {
  const home = profileHome(profile);
  return {
    home,
    envFile: join(home, ".env"),
    configFile: join(home, "config.yaml"),
  };
}

export function readEnv(profile?: string): Record<string, string> {
  const cacheKey = `env:${profile || "default"}`;
  const cached = getCached<Record<string, string>>(cacheKey);
  if (cached) return cached;

  const { envFile } = profilePaths(profile);
  if (!existsSync(envFile)) return {};

  const content = readFileSync(envFile, "utf-8");
  const result: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const eqIndex = trimmed.indexOf("=");
    const key = trimmed.substring(0, eqIndex).trim();
    let value = trimmed.substring(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (value) result[key] = value;
  }

  setCache(cacheKey, result);
  return result;
}

export function setEnvValue(
  key: string,
  value: string,
  profile?: string,
): void {
  const { envFile } = profilePaths(profile);
  invalidateCache(`env:${profile || "default"}`);

  if (!existsSync(envFile)) {
    safeWriteFile(envFile, `${key}=${value}\n`);
    return;
  }

  const content = readFileSync(envFile, "utf-8");
  const lines = content.split("\n");
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.match(new RegExp(`^#?\\s*${escapeRegex(key)}\\s*=`))) {
      lines[i] = `${key}=${value}`;
      found = true;
      break;
    }
  }

  if (!found) {
    lines.push(`${key}=${value}`);
  }

  safeWriteFile(envFile, lines.join("\n"));
}

export function getConfigValue(key: string, profile?: string): string | null {
  const { configFile } = profilePaths(profile);
  if (!existsSync(configFile)) return null;

  const content = readFileSync(configFile, "utf-8");
  const regex = new RegExp(
    `^\\s*${escapeRegex(key)}:\\s*["']?([^"'\\n#]+)["']?`,
    "m",
  );
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

export function setConfigValue(
  key: string,
  value: string,
  profile?: string,
): void {
  const { configFile } = profilePaths(profile);
  if (!existsSync(configFile)) return;

  let content = readFileSync(configFile, "utf-8");
  const regex = new RegExp(
    `^(\\s*#?\\s*${escapeRegex(key)}:\\s*)["']?[^"'\\n#]*["']?`,
    "m",
  );

  if (regex.test(content)) {
    content = content.replace(regex, `$1"${value}"`);
  }

  safeWriteFile(configFile, content);
}

function readYamlScalar(content: string, keys: string[]): string {
  for (const key of keys) {
    const root = content.match(
      new RegExp(`^\\s*${escapeRegex(key)}:\\s*["']?([^"'\\n#]+)["']?`, "m"),
    );
    if (root?.[1]) return root[1].trim();
    const nested = content.match(
      new RegExp(`^\\s+${escapeRegex(key)}:\\s*["']?([^"'\\n#]+)["']?`, "m"),
    );
    if (nested?.[1]) return nested[1].trim();
  }
  return "";
}

/** Fields under the `model:` block (gateway run.py reads `model.default`). */
export function readModelSectionFields(content: string): {
  provider: string;
  model: string;
  baseUrl: string;
} {
  const match = content.match(/^model:\s*\n((?:[ \t]+.+\n)*)/m);
  if (!match) return { provider: "", model: "", baseUrl: "" };
  const section = match[1];
  return {
    provider: readYamlScalar(section, ["provider"]),
    model: readYamlScalar(section, ["default", "model"]),
    baseUrl: readYamlScalar(section, ["base_url"]),
  };
}

export function upsertModelSectionBlock(
  content: string,
  provider: string,
  model: string,
  baseUrl: string,
): string {
  const block = [
    "model:",
    `  provider: "${provider}"`,
    `  default: "${model}"`,
    ...(baseUrl ? [`  base_url: "${baseUrl}"`] : []),
  ];

  const lines = content.split("\n");
  let modelLine = -1;
  let sectionEnd = lines.length;

  for (let i = 0; i < lines.length; i++) {
    if (/^model:\s*$/.test(lines[i])) {
      modelLine = i;
      continue;
    }
    if (modelLine >= 0 && i > modelLine) {
      if (/^[^\s#]/.test(lines[i]) && lines[i].trim() !== "") {
        sectionEnd = i;
        break;
      }
    }
  }

  if (modelLine >= 0) {
    return [...lines.slice(0, modelLine), ...block, ...lines.slice(sectionEnd)].join(
      "\n",
    );
  }

  const insert = `${block.join("\n")}\n`;
  if (/^platforms:/m.test(content)) {
    return content.replace(/^platforms:/m, `${insert}platforms:`);
  }
  return `${content.trimEnd()}\n\n${insert}`;
}

/**
 * Gateway `_resolve_gateway_model()` only reads `model.default`, not root-level
 * `default:`. Desktop historically wrote flat keys — mirror into `model:`.
 */
/** @returns true when config.yaml was updated with a `model:` section */
export function syncGatewayModelSection(profile?: string): boolean {
  const paths = profilePaths(profile);
  if (!existsSync(paths.configFile)) return false;

  let content = readFileSync(paths.configFile, "utf-8");
  const section = readModelSectionFields(content);
  const provider =
    section.provider ||
    readYamlScalar(content, ["provider", "default_provider"]) ||
    "auto";
  const model =
    section.model || readYamlScalar(content, ["default", "default_model"]);
  const baseUrl = section.baseUrl || readYamlScalar(content, ["base_url"]);

  if (!model) return false;

  const already =
    section.model === model &&
    (section.provider || provider) === provider &&
    (!baseUrl || section.baseUrl === baseUrl);
  if (already) return false;

  const next = upsertModelSectionBlock(content, provider, model, baseUrl);
  if (next === content) return false;

  safeWriteFile(paths.configFile, next);
  invalidateCache(`mc:${profile || "default"}`);
  return true;
}

function ensureHermesConfigFile(configFile: string, home: string): void {
  if (existsSync(configFile)) return;
  if (!existsSync(home)) {
    mkdirSync(home, { recursive: true });
  }
  const template = `provider: "auto"
default: ""
base_url: ""

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

export function getModelConfig(profile?: string): {
  provider: string;
  model: string;
  baseUrl: string;
} {
  const cacheKey = `mc:${profile || "default"}`;
  const cached = getCached<{ provider: string; model: string; baseUrl: string }>(cacheKey);
  if (cached) return cached;

  const { configFile } = profilePaths(profile);
  const defaults = { provider: "auto", model: "", baseUrl: "" };
  if (!existsSync(configFile)) return defaults;

  const content = readFileSync(configFile, "utf-8");
  const section = readModelSectionFields(content);

  const provider =
    section.provider ||
    readYamlScalar(content, ["provider", "default_provider"]);
  const model =
    section.model || readYamlScalar(content, ["default", "default_model"]);
  const baseUrl = section.baseUrl || readYamlScalar(content, ["base_url"]);

  const result = {
    provider: provider || defaults.provider,
    model: model || defaults.model,
    baseUrl: baseUrl || defaults.baseUrl,
  };

  setCache(cacheKey, result);
  return result;
}

export function setModelConfig(
  provider: string,
  model: string,
  baseUrl: string,
  profile?: string,
): void {
  // Phase 2: prefer Serve Configuration; fail closed when Serve preferred.
  assertLegacyYamlControlPlane("setModelConfig");
  invalidateCache(`mc:${profile || "default"}`);
  const paths = profilePaths(profile);
  ensureHermesConfigFile(paths.configFile, paths.home);

  let content = readFileSync(paths.configFile, "utf-8");

  const providerRegex = /^(\s*provider:\s*)["']?[^"'\n#]*["']?/m;
  if (providerRegex.test(content)) {
    content = content.replace(providerRegex, `$1"${provider}"`);
  } else {
    content = `provider: "${provider}"\n${content}`;
  }

  const modelRegex = /^(\s*default:\s*)["']?[^"'\n#]*["']?/m;
  if (modelRegex.test(content)) {
    content = content.replace(modelRegex, `$1"${model}"`);
  } else {
    content = content.replace(/^(\s*provider:.*\n)/m, `$1default: "${model}"\n`);
  }

  const baseUrlRegex = /^(\s*base_url:\s*)["']?[^"'\n#]*["']?/m;
  if (baseUrlRegex.test(content)) {
    content = content.replace(baseUrlRegex, `$1"${baseUrl}"`);
  } else if (baseUrl) {
    content = content.replace(/^(\s*default:.*\n)/m, `$1base_url: "${baseUrl}"\n`);
  }

  // Disable smart_model_routing
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (
      /^\s*enabled:\s*(true|false)/.test(lines[i]) &&
      i > 0 &&
      /smart_model_routing/.test(lines[i - 1])
    ) {
      lines[i] = lines[i].replace(/(enabled:\s*)(true|false)/, "$1false");
    }
  }
  content = lines.join("\n");

  // Enable streaming
  const streamingRegex = /^(\s*streaming:\s*)(\S+)/m;
  if (streamingRegex.test(content)) {
    content = content.replace(streamingRegex, "$1true");
  }

  safeWriteFile(paths.configFile, content);
  syncGatewayModelSection(profile);
}

export function getHermesHome(profile?: string): string {
  return profilePaths(profile).home;
}

// ── Platform enabled/disabled in config.yaml ────────────

const SUPPORTED_PLATFORMS = ["telegram", "discord", "slack", "whatsapp", "signal"];

export function getPlatformEnabled(profile?: string): Record<string, boolean> {
  const { configFile } = profilePaths(profile);
  if (!existsSync(configFile)) return {};

  const content = readFileSync(configFile, "utf-8");
  const result: Record<string, boolean> = {};

  for (const platform of SUPPORTED_PLATFORMS) {
    // Match "  platform:\n    enabled: true/false" under the platforms: block
    const re = new RegExp(
      `^[ \\t]+${platform}:\\s*\\n[ \\t]+enabled:\\s*(true|false)`,
      "m",
    );
    const match = content.match(re);
    result[platform] = match ? match[1] === "true" : false;
  }

  return result;
}

export function setPlatformEnabled(
  platform: string,
  enabled: boolean,
  profile?: string,
): void {
  if (!SUPPORTED_PLATFORMS.includes(platform)) return;

  const { configFile } = profilePaths(profile);
  if (!existsSync(configFile)) return;

  let content = readFileSync(configFile, "utf-8");

  // Check if the platform entry already exists under platforms:
  const existingRe = new RegExp(
    `^([ \\t]+${platform}:\\s*\\n[ \\t]+enabled:\\s*)(?:true|false)`,
    "m",
  );

  if (existingRe.test(content)) {
    // Update existing entry
    content = content.replace(existingRe, `$1${enabled}`);
  } else {
    // Append new platform entry after the platforms: block
    // Find the platforms: line and insert after the last existing platform entry
    const platformsIdx = content.indexOf("\nplatforms:");
    if (platformsIdx === -1) {
      // No platforms section at all — append one
      content += `\nplatforms:\n  ${platform}:\n    enabled: ${enabled}\n`;
    } else {
      // Insert the new platform at the end of the platforms block.
      // Find the next top-level key (non-indented, non-comment, non-empty line)
      // after the platforms: line.
      const afterPlatforms = content.substring(platformsIdx + 1);
      const lines = afterPlatforms.split("\n");
      let insertOffset = platformsIdx + 1; // after the \n
      // Skip the "platforms:" line itself
      insertOffset += lines[0].length + 1;

      // Skip all indented lines (children of platforms:)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === "" || /^\s/.test(line)) {
          insertOffset += line.length + 1;
        } else {
          break;
        }
      }

      const entry = `  ${platform}:\n    enabled: ${enabled}\n`;
      content =
        content.substring(0, insertOffset) +
        entry +
        content.substring(insertOffset);
    }
  }

  safeWriteFile(configFile, content);
}

// ── Credential Pool (auth.json) ──────────────────────────

function authFilePath(): string {
  return join(HERMES_HOME, "auth.json");
}

interface CredentialEntry {
  key: string;
  label: string;
}

function readAuthStore(): Record<string, unknown> {
  try {
    const p = authFilePath();
    if (!existsSync(p)) return {};
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return {};
  }
}

function writeAuthStore(store: Record<string, unknown>): void {
  safeWriteFile(authFilePath(), JSON.stringify(store, null, 2));
}

export function getCredentialPool(): Record<string, CredentialEntry[]> {
  const store = readAuthStore();
  const pool = store.credential_pool;
  if (!pool || typeof pool !== "object") return {};
  return pool as Record<string, CredentialEntry[]>;
}

export function setCredentialPool(
  provider: string,
  entries: CredentialEntry[],
): void {
  const store = readAuthStore();
  if (!store.credential_pool || typeof store.credential_pool !== "object") {
    store.credential_pool = {};
  }
  (store.credential_pool as Record<string, CredentialEntry[]>)[provider] =
    entries;
  writeAuthStore(store);
}
