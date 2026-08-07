import { existsSync } from "fs";
import { join } from "path";
import { isServeControlPlanePreferred } from "../copilot-runtime-client/runtime-mode";
import {
  readHermesConfig,
  writeHermesConfig,
  type HermesConfigDocument,
} from "../hermes-config/hermes-config-yaml";
import { profileHome } from "../utils";
import { listProfiles } from "../profiles";
import type {
  McpSkillGatewayProfileRegistration,
  McpSkillGatewayRegisterResult,
} from "../../shared/mcp-skill-gateway-runtime/mcp-skill-gateway-runtime-contract";
import {
  getMcpSkillGatewayConfig,
  resolveBackendBaseUrl,
  resolveLocalMcpUrl,
} from "./mcp-skill-gateway-config";
import { mcpRegistrationUrlsMatch } from "./mcp-profile-url";
import { testMcpSkillGatewayProxy } from "./mcp-skill-gateway-health";
import { isMcpSkillGatewayProxyRunning } from "./mcp-skill-gateway-proxy";
import { McpSkillGatewayError } from "./mcp-skill-gateway-errors";

const MCP_SERVER_KEY = "mcp_skill_gateway";

type McpServerEntry = {
  enabled: boolean;
  type: "http";
  url: string;
};

function configPathForProfile(profile: string): string {
  return join(profileHome(profile === "default" ? undefined : profile), "config.yaml");
}

function readMcpServerEntry(
  doc: HermesConfigDocument,
): McpServerEntry | null {
  const servers = doc.mcp_servers;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    return null;
  }
  const entry = (servers as Record<string, unknown>)[MCP_SERVER_KEY];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const raw = entry as Record<string, unknown>;
  return {
    enabled: Boolean(raw.enabled),
    type: "http",
    url: typeof raw.url === "string" ? raw.url : "",
  };
}

function buildProxyUrl(port: number, profile: string): string {
  return resolveLocalMcpUrl(port, profile);
}

async function ensureProfileExists(profile: string): Promise<void> {
  if (profile === "default") return;
  const profiles = await listProfiles();
  if (!profiles.some((p) => p.name === profile)) {
    throw new McpSkillGatewayError(
      "MCP_GATEWAY_PROFILE_NOT_FOUND",
      `Profile not found: ${profile}`,
    );
  }
}

async function assertRegistrationPreconditions(
  localProxyPort: number,
  profile: string,
): Promise<{ expectedUrl: string; backendMatched: boolean }> {
  const expectedUrl = buildProxyUrl(localProxyPort, profile);
  const authBackend = resolveBackendBaseUrl();

  if (!authBackend) {
    throw new McpSkillGatewayError(
      "MCP_GATEWAY_BACKEND_NOT_CONFIGURED",
      "Backend endpoint not configured",
    );
  }

  if (!isMcpSkillGatewayProxyRunning()) {
    throw new McpSkillGatewayError(
      "MCP_GATEWAY_PROXY_NOT_RUNNING",
      "Local MCP proxy is not running",
    );
  }

  const health = await testMcpSkillGatewayProxy();
  const backendMatched = health.backendBaseUrl === authBackend;
  if (!backendMatched) {
    throw new McpSkillGatewayError(
      "MCP_GATEWAY_BACKEND_MISMATCH",
      "Proxy backend does not match current login backend",
    );
  }

  if (health.localMcpUrl && health.localMcpUrl !== expectedUrl) {
    throw new McpSkillGatewayError(
      "MCP_GATEWAY_CONFIG_MISMATCH",
      "Proxy local URL does not match expected registration URL",
    );
  }

  return { expectedUrl, backendMatched };
}

function buildRegistrationState(
  profile: string,
  configPath: string,
  entry: McpServerEntry | null,
  localProxyPort: number,
  backendMatched: boolean,
): McpSkillGatewayProfileRegistration {
  const expectedUrl = buildProxyUrl(localProxyPort, profile);
  const url = entry?.url ?? null;
  const registered = entry != null;
  const enabled = Boolean(entry?.enabled);
  const urlMatched = mcpRegistrationUrlsMatch(url, expectedUrl, profile);

  return {
    profile,
    configPath,
    registered,
    enabled,
    url,
    expectedUrl,
    urlMatched,
    backendMatched,
    ready: registered && enabled && urlMatched && backendMatched,
    lastChecked: new Date().toISOString(),
  };
}

export async function registerMcpSkillGatewayToHermes(input: {
  profile: string;
  localProxyPort: number;
  enabled: boolean;
}): Promise<McpSkillGatewayRegisterResult> {
  const profile = input.profile || "default";
  await ensureProfileExists(profile);

  const configPath = configPathForProfile(profile);
  const expectedUrl = buildProxyUrl(input.localProxyPort, profile);

  try {
    let backendMatched = Boolean(resolveBackendBaseUrl());
    if (input.enabled) {
      const preconditions = await assertRegistrationPreconditions(
        input.localProxyPort,
        profile,
      );
      backendMatched = preconditions.backendMatched;
    }

    // Phase 2 hardening: Serve owns Hermes MCP config; do not write YAML.
    if (isServeControlPlanePreferred()) {
      console.warn(
        "[MCP-SKILL-GATEWAY] Serve control plane preferred — skip Hermes YAML MCP registration",
      );
      return {
        ok: false,
        changed: false,
        configPath,
        profile,
        url: expectedUrl,
        expectedUrl,
        urlMatched: false,
        backendMatched,
        ready: false,
        error:
          "Serve control plane owns Hermes MCP registration; Desktop YAML write skipped. Use Serve MCP APIs.",
        errorCode: "MCP_GATEWAY_CONFIG_WRITE_FAILED",
      };
    }

    const doc = readHermesConfig(profile === "default" ? undefined : profile);
    const nextEntry: McpServerEntry = {
      enabled: input.enabled,
      type: "http",
      url: expectedUrl,
    };

    const current = readMcpServerEntry(doc);
    const changed =
      !current ||
      current.enabled !== nextEntry.enabled ||
      current.url !== nextEntry.url ||
      current.type !== nextEntry.type;

    const servers =
      doc.mcp_servers && typeof doc.mcp_servers === "object" && !Array.isArray(doc.mcp_servers)
        ? { ...(doc.mcp_servers as Record<string, unknown>) }
        : {};

    servers[MCP_SERVER_KEY] = nextEntry;
    doc.mcp_servers = servers;

    if (changed) {
      writeHermesConfig(profile === "default" ? undefined : profile, doc);
    }

    const written = readMcpServerEntry(readHermesConfig(profile === "default" ? undefined : profile));
    const state = buildRegistrationState(
      profile,
      configPath,
      written,
      input.localProxyPort,
      backendMatched,
    );

    return {
      ok: true,
      changed,
      configPath,
      profile,
      url: state.url ?? expectedUrl,
      expectedUrl,
      urlMatched: state.urlMatched,
      backendMatched: state.backendMatched,
      ready: state.ready,
      hermesRestartRequired: changed,
    };
  } catch (err) {
    if (err instanceof McpSkillGatewayError) {
      return {
        ok: false,
        changed: false,
        configPath,
        profile,
        url: expectedUrl,
        expectedUrl,
        urlMatched: false,
        backendMatched: false,
        ready: false,
        error: err.message,
        errorCode: err.code,
      };
    }
    return {
      ok: false,
      changed: false,
      configPath,
      profile,
      url: expectedUrl,
      expectedUrl,
      urlMatched: false,
      backendMatched: false,
      ready: false,
      error: err instanceof Error ? err.message : String(err),
      errorCode: "MCP_GATEWAY_CONFIG_WRITE_FAILED",
    };
  }
}

export async function unregisterMcpSkillGatewayFromHermes(
  profile: string,
): Promise<McpSkillGatewayRegisterResult> {
  const config = getMcpSkillGatewayConfig();
  return registerMcpSkillGatewayToHermes({
    profile,
    localProxyPort: config.localProxyPort,
    enabled: false,
  });
}

export function listMcpSkillGatewayProfileRegistrations(): McpSkillGatewayProfileRegistration[] {
  const config = getMcpSkillGatewayConfig();
  const profiles = [...new Set(["default", ...config.registeredProfiles])];
  const backendMatched = Boolean(resolveBackendBaseUrl());

  return profiles.map((profile) => {
    const configPath = configPathForProfile(profile);
    const exists = existsSync(configPath);
    let entry: McpServerEntry | null = null;

    if (exists) {
      try {
        const doc = readHermesConfig(profile === "default" ? undefined : profile);
        entry = readMcpServerEntry(doc);
      } catch {
        entry = null;
      }
    }

    return buildRegistrationState(
      profile,
      configPath,
      entry,
      config.localProxyPort,
      backendMatched,
    );
  });
}
