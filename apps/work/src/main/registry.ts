import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { isAbsolute, join } from "path";
import { profileHome, safeWriteFile } from "./utils";
import { installSkill, listInstalledSkills } from "./skills";
import { createProfile } from "./profiles";
import { writeSoul } from "./soul";
import { listMcpServers } from "./installer";
import type {
  RegistryKind,
  RegistryItem,
  RegistryCatalog,
  InstalledRegistry,
  RegistryDetail,
  RegistryDetailRow,
  RegistryErrorCode,
  ModelRegistry,
} from "../shared/registry";

export type {
  RegistryKind,
  RegistryItem,
  RegistryCatalog,
} from "../shared/registry";

// @lat: [[registry-endpoint-configuration#Registry Endpoint Configuration]]
const REGISTRY_DESCRIPTOR_SCHEMA_VERSION = 1;
const REGISTRY_CONFIG_FILE = "work-registry-config.json";
const RUNTIME_CONFIG_ENV = "HERMES_SKILL_REGISTRY_CONFIG_FILE";
const CONFIG_INVALID =
  "SKILL_REGISTRY_CONFIG_INVALID" as const satisfies RegistryErrorCode;
const REGISTRY_UNAVAILABLE =
  "SKILL_REGISTRY_UNAVAILABLE" as const satisfies RegistryErrorCode;
const MAX_RESPONSE_CHARS = 1_000_000;
const MAX_DOWNLOAD_CHARS = 10_000_000;
const MAX_INDEX_ENTRIES = 10_000;
const MAX_TREE_ENTRIES = 50_000;
const MAX_PATH_LENGTH = 512;

export interface WorkRegistryEndpointDescriptor {
  schemaVersion: typeof REGISTRY_DESCRIPTOR_SCHEMA_VERSION;
  registryId: string;
  indexUrl: string;
  modelsUrl: string;
  contentBaseUrl: string;
  treeUrl: string;
  webBaseUrl: string;
  iconBaseUrl?: string;
}

type RegistrySource = "build" | "runtime" | "default";

interface ResolvedRegistry {
  source: RegistrySource;
  descriptor: WorkRegistryEndpointDescriptor;
  identity: string;
}

interface RegistryResolutionFailure {
  source: "build" | "runtime";
  code: typeof CONFIG_INVALID;
}

type RegistryResolution = ResolvedRegistry | RegistryResolutionFailure;

const PUBLIC_DEFAULT_DESCRIPTOR: WorkRegistryEndpointDescriptor = {
  schemaVersion: REGISTRY_DESCRIPTOR_SCHEMA_VERSION,
  registryId: "public-fathah-hermes-registry-main",
  indexUrl:
    "https://raw.githubusercontent.com/fathah/hermes-registry/refs/heads/main/index.json",
  modelsUrl:
    "https://raw.githubusercontent.com/fathah/hermes-registry/refs/heads/main/models.json",
  contentBaseUrl:
    "https://raw.githubusercontent.com/fathah/hermes-registry/refs/heads/main",
  treeUrl:
    "https://api.github.com/repos/fathah/hermes-registry/git/trees/main?recursive=1",
  webBaseUrl: "https://github.com/fathah/hermes-registry/tree/main",
  iconBaseUrl: "https://registry.hermesone.org/registry-icon",
};

let resolution: RegistryResolution | null = null;
let resolutionLogged = false;

function configError(source: "build" | "runtime"): RegistryResolutionFailure {
  return { source, code: CONFIG_INVALID };
}

function isResolutionFailure(
  value: RegistryResolution,
): value is RegistryResolutionFailure {
  return "code" in value;
}

function validateUrl(value: unknown, icon = false): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    if (
      icon
        ? url.protocol !== "https:"
        : !["http:", "https:"].includes(url.protocol)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function validateDescriptor(
  value: unknown,
): WorkRegistryEndpointDescriptor | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== REGISTRY_DESCRIPTOR_SCHEMA_VERSION) return null;
  if (
    typeof raw.registryId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(raw.registryId)
  ) {
    return null;
  }
  const indexUrl = validateUrl(raw.indexUrl);
  const modelsUrl = validateUrl(raw.modelsUrl);
  const contentBaseUrl = validateUrl(raw.contentBaseUrl);
  const treeUrl = validateUrl(raw.treeUrl);
  const webBaseUrl = validateUrl(raw.webBaseUrl);
  const iconBaseUrl =
    raw.iconBaseUrl === undefined
      ? undefined
      : validateUrl(raw.iconBaseUrl, true);
  if (
    !indexUrl ||
    !modelsUrl ||
    !contentBaseUrl ||
    !treeUrl ||
    !webBaseUrl ||
    (raw.iconBaseUrl !== undefined && !iconBaseUrl)
  ) {
    return null;
  }
  return {
    schemaVersion: REGISTRY_DESCRIPTOR_SCHEMA_VERSION,
    registryId: raw.registryId,
    indexUrl,
    modelsUrl,
    contentBaseUrl,
    treeUrl,
    webBaseUrl,
    ...(iconBaseUrl ? { iconBaseUrl } : {}),
  };
}

function readDescriptorFile(
  path: string,
): WorkRegistryEndpointDescriptor | null {
  try {
    if (!statSync(path).isFile()) return null;
    return validateDescriptor(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

function buildDescriptorPaths(): string[] {
  const paths: string[] = [];
  if (process.resourcesPath) {
    paths.push(join(process.resourcesPath, REGISTRY_CONFIG_FILE));
    paths.push(join(process.resourcesPath, "resources", REGISTRY_CONFIG_FILE));
  }
  paths.push(join(process.cwd(), "resources", REGISTRY_CONFIG_FILE));
  return [...new Set(paths)];
}

function descriptorIdentity(
  descriptor: WorkRegistryEndpointDescriptor,
): string {
  return JSON.stringify(descriptor);
}

function logResolution(value: RegistryResolution): void {
  if (resolutionLogged) return;
  resolutionLogged = true;
  if (isResolutionFailure(value)) {
    console.info(
      JSON.stringify({
        event: "work_registry_resolution",
        source: value.source,
        code: value.code,
      }),
    );
    return;
  }
  console.info(
    JSON.stringify({
      event: "work_registry_resolution",
      source: value.source,
      registryId: value.descriptor.registryId,
      origins: [
        value.descriptor.indexUrl,
        value.descriptor.modelsUrl,
        value.descriptor.contentBaseUrl,
        value.descriptor.treeUrl,
        value.descriptor.webBaseUrl,
        value.descriptor.iconBaseUrl,
      ]
        .filter((url): url is string => typeof url === "string")
        .map((url) => new URL(url).origin),
    }),
  );
}

function resolveRegistry(): RegistryResolution {
  if (resolution) return resolution;
  for (const path of buildDescriptorPaths()) {
    if (!existsSync(path)) continue;
    const descriptor = readDescriptorFile(path);
    resolution = descriptor
      ? {
          source: "build",
          descriptor,
          identity: descriptorIdentity(descriptor),
        }
      : configError("build");
    logResolution(resolution);
    return resolution;
  }
  if (Object.prototype.hasOwnProperty.call(process.env, RUNTIME_CONFIG_ENV)) {
    const path = process.env[RUNTIME_CONFIG_ENV] ?? "";
    if (!path || !isAbsolute(path)) {
      resolution = configError("runtime");
    } else {
      const descriptor = readDescriptorFile(path);
      resolution = descriptor
        ? {
            source: "runtime",
            descriptor,
            identity: descriptorIdentity(descriptor),
          }
        : configError("runtime");
    }
    logResolution(resolution);
    return resolution;
  }
  resolution = {
    source: "default",
    descriptor: PUBLIC_DEFAULT_DESCRIPTOR,
    identity: descriptorIdentity(PUBLIC_DEFAULT_DESCRIPTOR),
  };
  logResolution(resolution);
  return resolution;
}

function safeContentPath(value: string): string | null {
  if (
    !value ||
    value.length > MAX_PATH_LENGTH ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#")
  ) {
    return null;
  }
  const segments = value.split("/");
  return segments.every(
    (segment) => segment && segment !== "." && segment !== "..",
  )
    ? value
    : null;
}

function endpointUrl(base: string, path: string): string | null {
  const safePath = safeContentPath(path);
  if (!safePath) return null;
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return new URL(safePath, normalizedBase).toString();
}

function errorMessage(code: RegistryErrorCode): string {
  return code === CONFIG_INVALID
    ? "Registry configuration is invalid"
    : "Registry is unavailable";
}

export function __resetRegistryForTests(): void {
  resolution = null;
  resolutionLogged = false;
  cache = null;
  modelCache = null;
  treeCache = null;
}

class RegistryRequestError extends Error {}

async function fetchText(
  url: string,
  maxChars = MAX_RESPONSE_CHARS,
  accept = "application/json",
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: accept } });
  } catch {
    throw new RegistryRequestError();
  }
  if (!response.ok) throw new RegistryRequestError();
  const body = await response.text();
  if (body.length > maxChars) throw new RegistryRequestError();
  return body;
}

async function fetchJson<T>(
  url: string,
  maxChars = MAX_RESPONSE_CHARS,
): Promise<T> {
  try {
    return JSON.parse(await fetchText(url, maxChars)) as T;
  } catch {
    throw new RegistryRequestError();
  }
}

function catalogError(code: RegistryErrorCode): RegistryCatalog {
  return { ...EMPTY_CATALOG, error: errorMessage(code), errorCode: code };
}

function modelsError(code: RegistryErrorCode): ModelRegistry {
  return { providers: [], error: errorMessage(code), errorCode: code };
}

/** index.json entry shape. */
interface IndexEntry {
  id: string;
  type: "agent" | "mcp" | "skill" | "workflow";
  category?: string;
  name: string;
  version?: string;
  description?: string;
  tags?: string[];
  author?: string | { name?: string };
  license?: string;
  platforms?: string[];
  path?: string;
  /** Repo-relative path to the entry's icon, e.g. "mcp/ableton/icon.svg". */
  icon?: string;
}

/** Per-entry manifest.json (mcp / agent / workflow). */
interface EntryManifest {
  description?: string;
  // Matches the engine's accepted transports. "sse" must be preserved in the
  // written config — the engine only selects its SSE client when it sees it.
  transport?: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  permissions?: string[];
  entry?: string;
  requires?: string[];
  model?: string;
  tools?: string[];
  license?: string;
  compatibility?: { hermes?: string; desktop?: string } | null;
}

const TYPE_TO_KIND: Record<IndexEntry["type"], RegistryKind> = {
  skill: "skills",
  mcp: "mcps",
  agent: "agents",
  workflow: "workflows",
};

const EMPTY_CATALOG: RegistryCatalog = {
  skills: [],
  mcps: [],
  agents: [],
  workflows: [],
};

// Short-lived cache so flipping between Discover sub-tabs doesn't refetch.
// Covers the raw.githubusercontent fetches (index + models), which are
// CDN-backed and not subject to the api.github.com rate limit — so this stays
// short to keep the catalog/model list fresh. The rate-limited git-tree fetch
// caches separately for far longer (see TREE_CACHE_TTL_MS).
let cache: { at: number; identity: string; data: RegistryCatalog } | null =
  null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

function authorName(author: IndexEntry["author"]): string | undefined {
  if (!author) return undefined;
  return typeof author === "string" ? author : author.name;
}

function toItem(e: IndexEntry, resolved: ResolvedRegistry): RegistryItem {
  const path = e.path && safeContentPath(e.path) ? e.path : undefined;
  const icon =
    e.icon && resolved.descriptor.iconBaseUrl
      ? endpointUrl(resolved.descriptor.iconBaseUrl, e.icon)
      : undefined;
  return {
    id: e.id,
    name: e.name || e.id,
    description: e.description || "",
    author: authorName(e.author),
    category: e.category,
    tags: e.tags,
    version: e.version,
    license: e.license,
    platforms: e.platforms,
    path,
    homepage: path
      ? (endpointUrl(resolved.descriptor.webBaseUrl, path) ?? undefined)
      : undefined,
    icon: icon ?? undefined,
  };
}

/**
 * Fetch and normalise the community catalog. Network/parse failures resolve to
 * an empty catalog (with `error` set) rather than throwing, so the screen can
 * render an empty state instead of crashing.
 */
export async function fetchRegistry(force = false): Promise<RegistryCatalog> {
  const resolved = resolveRegistry();
  if (isResolutionFailure(resolved)) return catalogError(resolved.code);
  if (
    !force &&
    cache &&
    cache.identity === resolved.identity &&
    Date.now() - cache.at < CACHE_TTL_MS
  ) {
    return cache.data;
  }
  try {
    const raw = await fetchJson<{ entries?: IndexEntry[] }>(
      resolved.descriptor.indexUrl,
    );
    if (!Array.isArray(raw.entries) || raw.entries.length > MAX_INDEX_ENTRIES) {
      return catalogError(REGISTRY_UNAVAILABLE);
    }
    const data: RegistryCatalog = {
      skills: [],
      mcps: [],
      agents: [],
      workflows: [],
    };
    for (const entry of raw.entries) {
      const kind = TYPE_TO_KIND[entry.type];
      if (kind && entry.id) data[kind].push(toItem(entry, resolved));
    }
    cache = { at: Date.now(), identity: resolved.identity, data };
    return data;
  } catch {
    return catalogError(REGISTRY_UNAVAILABLE);
  }
}

// Short-lived cache for the model catalog (models.json).
let modelCache: { at: number; identity: string; data: ModelRegistry } | null =
  null;

/**
 * Fetch the curated model catalog (models.json) from the registry. Network /
 * parse failures resolve to an empty provider list (with `error` set) so the
 * Models screen can render a graceful empty state.
 */
export async function fetchModelRegistry(
  force = false,
): Promise<ModelRegistry> {
  const resolved = resolveRegistry();
  if (isResolutionFailure(resolved)) return modelsError(resolved.code);
  if (
    !force &&
    modelCache &&
    modelCache.identity === resolved.identity &&
    Date.now() - modelCache.at < CACHE_TTL_MS
  ) {
    return modelCache.data;
  }
  try {
    const raw = await fetchJson<ModelRegistry>(resolved.descriptor.modelsUrl);
    if (!Array.isArray(raw.providers)) return modelsError(REGISTRY_UNAVAILABLE);
    const data: ModelRegistry = {
      schemaVersion: raw.schemaVersion,
      generated: raw.generated,
      providerCount: raw.providerCount,
      modelCount: raw.modelCount,
      providers: Array.isArray(raw.providers) ? raw.providers : [],
    };
    modelCache = { at: Date.now(), identity: resolved.identity, data };
    return data;
  } catch {
    return modelsError(REGISTRY_UNAVAILABLE);
  }
}

/**
 * Names already present in the active profile, per kind, so the UI can mark
 * catalog items as "Installed".
 */
export function listInstalledRegistry(profile?: string): InstalledRegistry {
  let skills: string[] = [];
  let mcps: string[] = [];
  let workflows: string[] = [];
  try {
    skills = listInstalledSkills(profile).map((s) => s.name);
  } catch {
    /* ignore */
  }
  try {
    mcps = listMcpServers(profile).map((s) => s.name);
  } catch {
    /* ignore */
  }
  try {
    const dir = join(profileHome(profile), "workflows");
    if (existsSync(dir)) {
      // Workflows install as either <id>.<ext> files or <id>/ folders.
      workflows = readdirSync(dir).map((f) =>
        f.replace(/\.(js|mjs|ts|json)$/, ""),
      );
    }
  } catch {
    /* ignore */
  }
  return { skills, mcps, workflows };
}

export interface InstallResult {
  success: boolean;
  error?: string;
  errorCode?: RegistryErrorCode;
}

async function tryFetchText(path: string): Promise<string> {
  const resolved = resolveRegistry();
  if (isResolutionFailure(resolved)) return "";
  const url = endpointUrl(resolved.descriptor.contentBaseUrl, path);
  if (!url) return "";
  try {
    const text = await fetchText(url, MAX_RESPONSE_CHARS, "text/plain, */*");
    return text.trim() ? text : "";
  } catch {
    return "";
  }
}

/** Build a structured spec (lead + labeled rows) from an entry's manifest. */
function buildSpec(
  kind: RegistryKind,
  item: RegistryItem,
  m: EntryManifest | null,
): RegistryDetail {
  const rows: RegistryDetailRow[] = [];

  if (kind === "mcps" && m) {
    rows.push({
      label: "Transport",
      value: m.transport || (m.url ? "http" : "stdio"),
    });
    if (m.url) rows.push({ label: "URL", value: m.url, mono: true });
    if (m.command) {
      rows.push({
        label: "Command",
        value: [m.command, ...(m.args ?? [])].join(" "),
        mono: true,
      });
    }
    if (m.env && Object.keys(m.env).length) {
      rows.push({ label: "Environment", chips: Object.keys(m.env) });
    }
    if (m.permissions?.length) {
      rows.push({ label: "Permissions", chips: m.permissions });
    }
  } else if (kind === "agents" && m) {
    if (m.model) rows.push({ label: "Model", value: m.model, mono: true });
    if (m.tools?.length) rows.push({ label: "Tools", chips: m.tools });
  } else if (kind === "workflows" && m) {
    if (m.entry) rows.push({ label: "Entry", value: m.entry, mono: true });
    if (m.requires?.length) rows.push({ label: "Requires", chips: m.requires });
  }

  if (item.category) rows.push({ label: "Category", value: item.category });
  if (item.platforms?.length) {
    rows.push({ label: "Platforms", chips: item.platforms });
  }
  if (item.tags?.length) rows.push({ label: "Tags", chips: item.tags });
  const license = m?.license || item.license;
  if (license) rows.push({ label: "License", value: license });
  if (item.author) rows.push({ label: "Author", value: item.author });
  if (item.version) rows.push({ label: "Version", value: item.version });
  const compat = m?.compatibility;
  if (compat?.hermes) {
    rows.push({ label: "Requires Hermes", value: compat.hermes, mono: true });
  }

  return { description: m?.description || item.description || "", rows };
}

/**
 * Detail for an item's modal. For skills, the prose doc (SKILL.md/README) is
 * the content. For mcp/agent/workflow we always build the structured spec from
 * the manifest and attach a prose doc (AGENT.md/README) as extra context when
 * present — so the modal is never just a one-line description.
 */
export async function fetchRegistryDetail(
  kind: RegistryKind,
  item: RegistryItem,
): Promise<RegistryDetail> {
  const resolved = resolveRegistry();
  if (isResolutionFailure(resolved)) {
    return {
      description: item.description || "",
      error: errorMessage(resolved.code),
      errorCode: resolved.code,
    };
  }
  if (!item.path) return { description: item.description || "" };

  if (kind === "skills") {
    for (const file of ["SKILL.md", "README.md"]) {
      const text = await tryFetchText(`${item.path}/${file}`);
      if (text) return { markdown: text };
    }
    return { description: item.description || "" };
  }

  const m = await fetchManifest(item.path);
  const detail = buildSpec(kind, item, m);
  const docFile = kind === "agents" ? "AGENT.md" : "README.md";
  const doc = await tryFetchText(`${item.path}/${docFile}`);
  if (doc) detail.markdown = doc;
  return detail;
}

async function fetchManifest(path: string): Promise<EntryManifest | null> {
  const resolved = resolveRegistry();
  if (isResolutionFailure(resolved)) return null;
  const url = endpointUrl(
    resolved.descriptor.contentBaseUrl,
    `${path}/manifest.json`,
  );
  if (!url) return null;
  try {
    return await fetchJson<EntryManifest>(url);
  } catch {
    return null;
  }
}

/** One blob in the repo's recursive git tree. */
interface TreeBlob {
  path: string;
  type: string;
}
let treeCache: { at: number; identity: string; blobs: TreeBlob[] } | null =
  null;
// The recursive git tree is fetched from api.github.com, which rate-limits
// anonymous callers at 60 req/h (token auth below raises that ceiling). Cache
// it far longer than the CDN-backed raw fetches to keep that pressure low.
const TREE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/** All file paths under a folder, via the cached recursive git tree. */
async function listFolderFiles(folder: string): Promise<string[]> {
  const resolved = resolveRegistry();
  if (isResolutionFailure(resolved)) throw new RegistryRequestError();
  const safeFolder = safeContentPath(folder);
  if (!safeFolder) throw new RegistryRequestError();
  if (
    !treeCache ||
    treeCache.identity !== resolved.identity ||
    Date.now() - treeCache.at >= TREE_CACHE_TTL_MS
  ) {
    const json = await fetchJson<{ tree?: TreeBlob[] }>(
      resolved.descriptor.treeUrl,
    );
    if (!Array.isArray(json.tree) || json.tree.length > MAX_TREE_ENTRIES) {
      throw new RegistryRequestError();
    }
    const blobs = json.tree.filter(
      (entry): entry is TreeBlob =>
        !!entry &&
        typeof entry.path === "string" &&
        entry.type === "blob" &&
        safeContentPath(entry.path) !== null,
    );
    treeCache = { at: Date.now(), identity: resolved.identity, blobs };
  }
  const prefix = `${safeFolder}/`;
  return treeCache.blobs
    .filter((b) => b.type === "blob" && b.path.startsWith(prefix))
    .map((b) => b.path);
}

/** Download every file under an entry's repo folder into a local directory. */
async function downloadFolder(
  repoFolder: string,
  destDir: string,
): Promise<InstallResult> {
  const resolved = resolveRegistry();
  if (isResolutionFailure(resolved)) {
    return {
      success: false,
      error: errorMessage(resolved.code),
      errorCode: resolved.code,
    };
  }
  const files = await listFolderFiles(repoFolder);
  if (files.length === 0) {
    return { success: false, error: "No files found for this entry" };
  }
  for (const file of files) {
    const rel = file.slice(repoFolder.length + 1);
    const url = endpointUrl(resolved.descriptor.contentBaseUrl, file);
    if (!url || !safeContentPath(rel)) {
      return {
        success: false,
        error: errorMessage(REGISTRY_UNAVAILABLE),
        errorCode: REGISTRY_UNAVAILABLE,
      };
    }
    let body: string;
    try {
      body = await fetchText(url, MAX_DOWNLOAD_CHARS, "text/plain, */*");
    } catch {
      return {
        success: false,
        error: errorMessage(REGISTRY_UNAVAILABLE),
        errorCode: REGISTRY_UNAVAILABLE,
      };
    }
    safeWriteFile(join(destDir, rel), body);
  }
  return { success: true };
}

/** Quote a string for single-line YAML if it needs it. */
function yamlScalar(value: string): string {
  return /[:#{}[\],&*?|<>=!%@`"']/.test(value) || value.trim() !== value
    ? JSON.stringify(value)
    : value;
}

/**
 * Render one MCP server (from its manifest) as an indented YAML block, in the
 * exact shape the engine's config loader expects (see hermes-agent
 * `tools/mcp_tool.py`): a remote server is keyed by `url` (+ optional
 * `transport: sse` and `headers`); a local server by `command` (+ `args`,
 * `env`). The engine discriminates purely on the presence of `url`.
 */
function renderMcpYaml(id: string, m: EntryManifest): string {
  const lines: string[] = [`  ${id}:`];
  // Remote when the manifest carries a URL or declares an http/sse transport;
  // otherwise it's a stdio (subprocess) server.
  const remote = !!m.url || m.transport === "http" || m.transport === "sse";
  if (remote) {
    if (m.url) lines.push(`    url: ${yamlScalar(m.url)}`);
    // The engine only uses its SSE client when transport is explicitly "sse";
    // streamable-HTTP is the default, so we omit transport otherwise.
    if (m.transport === "sse") lines.push(`    transport: sse`);
    if (m.headers && Object.keys(m.headers).length) {
      lines.push(`    headers:`);
      for (const [k, v] of Object.entries(m.headers)) {
        lines.push(`      ${k}: ${yamlScalar(String(v))}`);
      }
    }
  } else {
    if (m.command) lines.push(`    command: ${yamlScalar(m.command)}`);
    if (m.args?.length) {
      lines.push(`    args:`);
      for (const a of m.args) lines.push(`      - ${yamlScalar(String(a))}`);
    }
    if (m.env && Object.keys(m.env).length) {
      lines.push(`    env:`);
      for (const [k, v] of Object.entries(m.env)) {
        lines.push(`      ${k}: ${yamlScalar(String(v))}`);
      }
    }
  }
  lines.push(`    enabled: true`);
  return lines.join("\n") + "\n";
}

/**
 * Add an MCP server entry under `mcp_servers:` in the profile's config.yaml.
 * Mirrors the regex-based reader in installer.ts — no YAML lib is available,
 * so we splice text directly.
 */
async function installMcp(
  item: RegistryItem,
  profile?: string,
): Promise<InstallResult> {
  if (!item.path) return { success: false, error: "MCP entry has no path" };
  const m = await fetchManifest(item.path);
  if (!m || (!m.url && !m.command)) {
    return { success: false, error: "MCP manifest has no connection config" };
  }

  const configPath = join(profileHome(profile), "config.yaml");
  let content = existsSync(configPath) ? readFileSync(configPath, "utf-8") : "";
  const block = renderMcpYaml(item.id, m);
  const sectionRe = /^mcp_servers:\s*\n/m;

  if (sectionRe.test(content)) {
    if (new RegExp(`^[ ]{2}${item.id}:\\s*$`, "m").test(content)) {
      return { success: false, error: "Already configured" };
    }
    content = content.replace(sectionRe, (mm) => mm + block);
  } else {
    if (content.length && !content.endsWith("\n")) content += "\n";
    content += `mcp_servers:\n${block}`;
  }

  try {
    safeWriteFile(configPath, content);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to write config",
    };
  }
}

/** Download a registry skill's folder into <profile>/skills/<category>/<id>/. */
async function installRegistrySkill(
  item: RegistryItem,
  profile?: string,
): Promise<InstallResult> {
  if (!item.path) return { success: false, error: "Skill entry has no path" };
  const category = item.category || "uncategorized";
  const dest = join(profileHome(profile), "skills", category, item.id);
  return downloadFolder(item.path, dest);
}

/** Download a workflow's folder into <profile>/workflows/<id>/. */
async function installWorkflow(
  item: RegistryItem,
  profile?: string,
): Promise<InstallResult> {
  if (!item.path)
    return { success: false, error: "Workflow entry has no path" };
  const dest = join(profileHome(profile), "workflows", item.id);
  return downloadFolder(item.path, dest);
}

/**
 * Install a registry agent as a new profile. Cloning alone copies the default
 * persona, so the imported agent looked identical to default — the bug. We
 * fetch the agent's entry markdown (AGENT.md per the manifest) from the
 * registry and write it as the new profile's SOUL.md so the persona reflects
 * the published agent.
 */
async function installAgent(item: RegistryItem): Promise<InstallResult> {
  const created = createProfile(item.id, "default");
  if (!created.success) return created;
  if (item.path) {
    const m = await fetchManifest(item.path);
    const entry = m?.entry || "AGENT.md";
    const md = await tryFetchText(`${item.path}/${entry}`);
    if (md && !writeSoul(md, item.id)) {
      return {
        success: false,
        error: "Failed to write agent persona (SOUL.md)",
      };
    }
  }
  return { success: true };
}

/**
 * Install/"set up" a catalog item into the active profile.
 *   - skill    → download the entry folder into <profile>/skills/<category>/<id>/
 *                (bundled skills, which carry `source` and no `path`, install
 *                via `hermes skills install <source>`)
 *   - mcp      → append the manifest's server to config.yaml `mcp_servers:`
 *   - agent    → clone a profile named after the agent and set its SOUL.md
 *                from the agent's AGENT.md
 *   - workflow → download the entry folder into <profile>/workflows/<id>/
 */
export async function installRegistryItem(
  kind: RegistryKind,
  item: RegistryItem,
  profile?: string,
): Promise<InstallResult> {
  const resolved = resolveRegistry();
  if (isResolutionFailure(resolved)) {
    return {
      success: false,
      error: errorMessage(resolved.code),
      errorCode: resolved.code,
    };
  }
  try {
    switch (kind) {
      case "skills":
        return item.path
          ? await installRegistrySkill(item, profile)
          : installSkill(item.source || item.id, profile);
      case "mcps":
        return await installMcp(item, profile);
      case "agents":
        return await installAgent(item);
      case "workflows":
        return await installWorkflow(item, profile);
      default:
        return { success: false, error: "Unknown item kind" };
    }
  } catch {
    return {
      success: false,
      error: errorMessage(REGISTRY_UNAVAILABLE),
      errorCode: REGISTRY_UNAVAILABLE,
    };
  }
}
