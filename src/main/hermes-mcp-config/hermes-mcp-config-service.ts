import http from "http";
import { randomBytes } from "crypto";
import {
  readHermesConfig,
  writeHermesConfig,
  type HermesConfigDocument,
} from "../hermes-config/hermes-config-yaml";
import { readEnv, setEnvValue } from "../config";
import { isGatewayRunning, restartGatewayAsync } from "../hermes";
import type {
  HermesMcpListToolsResult,
  HermesMcpServerMutationResult,
  HermesMcpServerView,
  HermesMcpTestServerResult,
  SaveHermesMcpServerInput,
} from "../../shared/hermes-mcp-config/hermes-mcp-config-contract";
import {
  DEFAULT_EXPERT_MCP_ENV,
  DEFAULT_EXPERT_MCP_SERVER,
  type HermesMcpServerYamlEntry,
  validateSaveHermesMcpServerInput,
} from "./hermes-mcp-config-validator";

function readMcpServers(doc: HermesConfigDocument): Record<string, HermesMcpServerYamlEntry> {
  const raw = doc.mcp_servers;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, HermesMcpServerYamlEntry>;
}

function resolveEnvKey(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

function ensureDesktopId(profile?: string): void {
  const env = readEnv(profile);
  if (env[DEFAULT_EXPERT_MCP_ENV.desktopId]?.trim()) return;
  setEnvValue(DEFAULT_EXPERT_MCP_ENV.desktopId, `desktop-${randomBytes(8).toString("hex")}`, profile);
}

function toServerView(
  name: string,
  entry: HermesMcpServerYamlEntry,
  profile?: string,
): HermesMcpServerView {
  const env = readEnv(profile);
  const tokenEnvKey =
    name === DEFAULT_EXPERT_MCP_SERVER
      ? DEFAULT_EXPERT_MCP_ENV.token
      : `${name.toUpperCase()}_MCP_TOKEN`;
  const urlEnvKey =
    name === DEFAULT_EXPERT_MCP_SERVER ? DEFAULT_EXPERT_MCP_ENV.url : `${name.toUpperCase()}_MCP_URL`;

  const tokenConfigured = Boolean(env[tokenEnvKey]?.trim());
  const url = entry.url?.trim() || (env[urlEnvKey] ? `\${${urlEnvKey}}` : "");
  const enabled = entry.enabled !== false;
  let status: HermesMcpServerView["status"] = "unknown";
  if (!url) status = "misconfigured";
  else if (!enabled) status = "disabled";
  else if (tokenConfigured || name !== DEFAULT_EXPERT_MCP_SERVER) status = "enabled";
  else status = "misconfigured";

  return {
    name,
    enabled,
    url,
    urlEnvKey,
    tokenConfigured,
    tokenEnvKey,
    timeout: entry.timeout,
    headers: entry.headers,
    toolsInclude: entry.tools?.include,
    status,
  };
}

async function pingHermesHealth(profile?: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get("http://127.0.0.1:8642/health", (res) => {
      resolve(res.statusCode != null && res.statusCode >= 200 && res.statusCode < 300);
      res.resume();
    });
    req.on("error", () => resolve(false));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function restartIfNeeded(profile?: string): Promise<boolean> {
  if (!(await isGatewayRunning(profile))) return false;
  await restartGatewayAsync(profile);
  return true;
}

export async function listHermesMcpServers(profile?: string): Promise<HermesMcpServerView[]> {
  const doc = readHermesConfig(profile);
  const servers = readMcpServers(doc);
  return Object.entries(servers).map(([name, entry]) => toServerView(name, entry, profile));
}

export async function saveHermesMcpServer(
  input: SaveHermesMcpServerInput,
): Promise<HermesMcpServerMutationResult> {
  const validationError = validateSaveHermesMcpServerInput(input);
  if (validationError) {
    return { ok: false, errorCode: "INVALID_INPUT", message: validationError };
  }

  const profile = input.profile;
  const name = input.name.trim();
  const doc = readHermesConfig(profile);
  const servers = readMcpServers(doc);
  const existing = servers[name] ?? {};

  const urlEnvKey = resolveEnvKey(
    input.urlEnvKey,
    name === DEFAULT_EXPERT_MCP_SERVER
      ? DEFAULT_EXPERT_MCP_ENV.url
      : `${name.toUpperCase()}_MCP_URL`,
  );
  const tokenEnvKey = resolveEnvKey(
    input.tokenEnvKey,
    name === DEFAULT_EXPERT_MCP_SERVER
      ? DEFAULT_EXPERT_MCP_ENV.token
      : `${name.toUpperCase()}_MCP_TOKEN`,
  );

  if (input.url?.trim()) {
    setEnvValue(urlEnvKey, input.url.trim(), profile);
  }
  if (input.token?.trim()) {
    setEnvValue(tokenEnvKey, input.token.trim(), profile);
  }
  ensureDesktopId(profile);

  servers[name] = {
    ...existing,
    enabled: input.enabled ?? existing.enabled ?? true,
    url: `\${${urlEnvKey}}`,
    timeout: input.timeout ?? existing.timeout ?? 600,
    headers: {
      Authorization: `Bearer \${${tokenEnvKey}}`,
      "X-Client": "copilot-desktop",
      "X-Desktop-Id": `\${${DEFAULT_EXPERT_MCP_ENV.desktopId}}`,
      ...(input.headers ?? existing.headers ?? {}),
    },
    tools: {
      include: input.toolsInclude ?? existing.tools?.include ?? [],
    },
  };

  doc.mcp_servers = servers;
  writeHermesConfig(profile, doc);
  const restarted = await restartIfNeeded(profile);

  return {
    ok: true,
    server: toServerView(name, servers[name], profile),
    restarted,
  };
}

export async function removeHermesMcpServer(
  name: string,
  profile?: string,
): Promise<HermesMcpServerMutationResult> {
  const doc = readHermesConfig(profile);
  const servers = readMcpServers(doc);
  if (!servers[name]) {
    return { ok: false, errorCode: "NOT_FOUND", message: `MCP server not found: ${name}` };
  }
  delete servers[name];
  doc.mcp_servers = servers;
  writeHermesConfig(profile, doc);
  const restarted = await restartIfNeeded(profile);
  return { ok: true, restarted };
}

export async function setHermesMcpServerEnabled(
  name: string,
  enabled: boolean,
  profile?: string,
): Promise<HermesMcpServerMutationResult> {
  const doc = readHermesConfig(profile);
  const servers = readMcpServers(doc);
  const entry = servers[name];
  if (!entry) {
    return { ok: false, errorCode: "NOT_FOUND", message: `MCP server not found: ${name}` };
  }
  servers[name] = { ...entry, enabled };
  doc.mcp_servers = servers;
  writeHermesConfig(profile, doc);
  const restarted = await restartIfNeeded(profile);
  return { ok: true, server: toServerView(name, servers[name], profile), restarted };
}

export async function testHermesMcpServer(
  name: string,
  profile?: string,
): Promise<HermesMcpTestServerResult> {
  const doc = readHermesConfig(profile);
  const servers = readMcpServers(doc);
  const entry = servers[name];
  if (!entry) {
    return { ok: false, errorCode: "NOT_FOUND", message: `MCP server not found: ${name}` };
  }

  const gatewayHealthy = await pingHermesHealth(profile);
  const view = toServerView(name, entry, profile);
  const serverRegistered = view.status === "enabled";

  if (!gatewayHealthy) {
    return {
      ok: false,
      gatewayHealthy,
      serverRegistered,
      errorCode: "GATEWAY_UNHEALTHY",
      message: "Hermes Gateway is not healthy on :8642",
    };
  }

  if (!serverRegistered) {
    return {
      ok: false,
      gatewayHealthy,
      serverRegistered,
      errorCode: "SERVER_MISCONFIGURED",
      message: "MCP server config is incomplete (url/token/tools)",
    };
  }

  return {
    ok: true,
    gatewayHealthy,
    serverRegistered,
    message: "Hermes Gateway healthy and MCP server registered in config.yaml",
  };
}

export async function reloadHermesMcpConfig(
  profile?: string,
): Promise<{ ok: boolean; restarted?: boolean; message?: string }> {
  const restarted = await restartIfNeeded(profile);
  return {
    ok: true,
    restarted,
    message: restarted ? "Hermes Gateway restarted" : "Gateway was not running",
  };
}

export async function listHermesMcpTools(
  name: string,
  profile?: string,
): Promise<HermesMcpListToolsResult> {
  const doc = readHermesConfig(profile);
  const servers = readMcpServers(doc);
  const entry = servers[name];
  if (!entry) {
    return { ok: false, tools: [], source: "config", message: `MCP server not found: ${name}` };
  }

  const tools = entry.tools?.include?.filter(Boolean) ?? [];
  return {
    ok: true,
    tools,
    source: "config",
    message:
      tools.length > 0
        ? "Tools loaded from hermes-agent config.yaml mcp_servers.tools.include"
        : "No tools configured in mcp_servers.tools.include",
  };
}

export async function seedDefaultExpertMcpServer(profile?: string): Promise<void> {
  const doc = readHermesConfig(profile);
  const servers = readMcpServers(doc);
  if (servers[DEFAULT_EXPERT_MCP_SERVER]) return;

  await saveHermesMcpServer({
    name: DEFAULT_EXPERT_MCP_SERVER,
    enabled: false,
    urlEnvKey: DEFAULT_EXPERT_MCP_ENV.url,
    tokenEnvKey: DEFAULT_EXPERT_MCP_ENV.token,
    toolsInclude: [],
    profile,
  });
}
