/**
 * Expert MCP Gateway v6.1 — class-based JSON-RPC client for /api/v1/expert/*.
 */
import { app } from "electron";
import { unwrapNodeDeskClawResponse } from "../auth/nodeskclaw-auth-response";
import { getDeviceIdentity } from "../genehub/device-identity";
import { getMcpAccessToken } from "../mcp-skill-gateway-runtime/mcp-token-provider";
import {
  joinExpertMcpPath,
  resolveExpertHealthUrl,
  resolveExpertMcpRootUrl,
  resolveExpertMcpSlugUrl,
} from "./expert-mcp-endpoint";
import type {
  ExpertCallArguments,
  ExpertHealthResponse,
  ExpertMcpCallResult,
  JsonRpcRequest,
  JsonRpcResponse,
  RemoteCatalogItem,
  RemoteExpertSkill,
  RemoteRunContext,
  ToolsCallResult,
  ToolsListResult,
} from "../../shared/hermes-experts/hermes-experts-contract";
import type { OpenAICompatibleExpertPayload } from "../../shared/hermes-experts/expert-task-stream-contract";
import { HermesExpertsError } from "../../shared/hermes-experts/hermes-experts-errors";
import {
  extractTextContent,
  mapCatalogTool,
  mapSkillTool,
  normalizeExpertJsonRpcError,
  type ExpertMcpToolDescriptor,
} from "./expert-mcp-mappers";
import { assertNoRouteOverride } from "./expert-route-guard";

export type { ExpertMcpToolDescriptor };

let rpcId = 0;
let clientInstance: ExpertMcpClient | null = null;
let clientBaseUrl: string | null = null;

function resolveClientBaseUrl(): string {
  const root = resolveExpertMcpRootUrl();
  if (!root) {
    throw new HermesExpertsError("EXPERT_MCP_ENDPOINT_NOT_CONFIGURED", "Backend URL is not configured");
  }
  const health = resolveExpertHealthUrl();
  return health.replace(/\/health$/, "");
}

function clientVersionHeader(): string {
  return `copilot-desktop/${app.getVersion()}`;
}

export function buildDefaultRemoteContext(extra?: RemoteRunContext): RemoteRunContext {
  const device = getDeviceIdentity();
  return {
    source: "copilot-desktop",
    device_id: device.deviceFingerprint,
    workspace_id: "default",
    client_version: app.getVersion(),
    ...extra,
  };
}

export function buildExpertToolArguments(input: {
  prompt: string;
  context?: RemoteRunContext;
}): ExpertCallArguments {
  return {
    prompt: input.prompt,
    context: buildDefaultRemoteContext(input.context) as ExpertCallArguments["context"],
  };
}

export class ExpertMcpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly getToken: () => string | null,
  ) {}

  private async fetchWithAuth<T>(path: string, init?: RequestInit): Promise<T> {
    const token = this.getToken();
    if (!token) {
      throw new HermesExpertsError("NODESKCLAW_UNAUTHORIZED", "Desktop login required");
    }
    const device = getDeviceIdentity();
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "X-NoDeskClaw-Desktop-Device-Id": device.deviceFingerprint,
      "X-NoDeskClaw-Client": "copilot-desktop",
      "X-NoDeskClaw-Expert-MCP-Version": "v1.2.1_hotfix",
      "X-Client-Version": clientVersionHeader(),
      ...(init?.headers as Record<string, string> | undefined),
    };
    if (init?.body) headers["Content-Type"] = "application/json";

    const url = path.startsWith("http") ? path : joinExpertMcpPath(path);
    const res = await fetch(url, { ...init, headers });
    if (!res.ok) {
      throw new HermesExpertsError(
        res.status === 401 ? "NODESKCLAW_UNAUTHORIZED" : "NODESKCLAW_BACKEND_UNREACHABLE",
        `HTTP ${res.status}`,
      );
    }
    const json = (await res.json()) as unknown;
    return unwrapNodeDeskClawResponse<T>(json);
  }

  async postJsonRpc<TResult>(path: string, body: JsonRpcRequest): Promise<TResult> {
    const json = await this.fetchWithAuth<JsonRpcResponse<TResult>>(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if ("error" in json) {
      throw normalizeExpertJsonRpcError(json.error);
    }
    return json.result;
  }

  async health(): Promise<ExpertHealthResponse> {
    try {
      const healthUrl = resolveExpertHealthUrl();
      if (!healthUrl) {
        throw new HermesExpertsError("EXPERT_MCP_ENDPOINT_NOT_CONFIGURED", "Backend URL is not configured");
      }
      const data = await this.fetchWithAuth<Record<string, unknown>>(healthUrl, {
        method: "GET",
      });
      const gateway = data.gateway as Record<string, unknown> | undefined;
      const status =
        typeof data.status === "string"
          ? data.status
          : data.ok === true || data.healthy === true
            ? "healthy"
            : "unknown";
      return {
        ok: status === "healthy" || status === "ok" || data.ok === true || data.healthy === true,
        status,
        version:
          typeof data.version === "string"
            ? data.version
            : typeof gateway?.version === "string"
              ? gateway.version
              : undefined,
        message: typeof data.message === "string" ? data.message : undefined,
        gateway: gateway
          ? {
              name: typeof gateway.name === "string" ? gateway.name : undefined,
              version: typeof gateway.version === "string" ? gateway.version : undefined,
            }
          : undefined,
        publishedExperts: Number(data.publishedExperts ?? data.published_experts ?? 0) || undefined,
        publishedExpertTeams:
          Number(data.publishedExpertTeams ?? data.published_expert_teams ?? 0) || undefined,
        publicSkills: Number(data.publicSkills ?? data.public_skills ?? 0) || undefined,
        callableSkills: Number(data.callableSkills ?? data.callable_skills ?? 0) || undefined,
        runtimeReady: data.runtimeReady === true || data.runtime_ready === true,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof HermesExpertsError) throw err;
      return { ok: false, status: "unreachable", message };
    }
  }

  async initializeRoot(): Promise<unknown> {
    const rootUrl = resolveExpertMcpRootUrl();
    if (!rootUrl) {
      throw new HermesExpertsError("EXPERT_MCP_ENDPOINT_NOT_CONFIGURED", "Backend URL is not configured");
    }
    return this.postJsonRpc(rootUrl, {
      jsonrpc: "2.0",
      id: `init-${++rpcId}`,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "copilot-desktop", version: app.getVersion() },
      },
    });
  }

  async listCatalog(): Promise<RemoteCatalogItem[]> {
    try {
      await this.initializeRoot();
    } catch {
      /* root may not require initialize */
    }
    const rootUrl = resolveExpertMcpRootUrl();
    if (!rootUrl) {
      throw new HermesExpertsError("EXPERT_MCP_ENDPOINT_NOT_CONFIGURED", "Backend URL is not configured");
    }
    const result = await this.postJsonRpc<ToolsListResult>(rootUrl, {
      jsonrpc: "2.0",
      id: `catalog-${++rpcId}`,
      method: "tools/list",
    });
    return (result.tools ?? [])
      .map((tool) => mapCatalogTool(tool as ExpertMcpToolDescriptor))
      .filter((item): item is RemoteCatalogItem => item != null);
  }

  async listSkills(slug: string): Promise<RemoteExpertSkill[]> {
    const trimmed = slug.trim();
    if (!trimmed) return [];
    const slugUrl = resolveExpertMcpSlugUrl(trimmed);
    if (!slugUrl) return [];
    try {
      await this.postJsonRpc(slugUrl, {
        jsonrpc: "2.0",
        id: `init-slug-${++rpcId}`,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "copilot-desktop", version: app.getVersion() },
        },
      });
    } catch {
      /* slug endpoint may not require initialize */
    }
    const result = await this.postJsonRpc<ToolsListResult>(slugUrl, {
      jsonrpc: "2.0",
      id: `skills-${++rpcId}`,
      method: "tools/list",
    });
    return (result.tools ?? [])
      .map((tool) => mapSkillTool(tool as ExpertMcpToolDescriptor))
      .filter((item): item is RemoteExpertSkill => item != null);
  }

  async callSkill(input: {
    slug: string;
    skillName: string;
    arguments: ExpertCallArguments | OpenAICompatibleExpertPayload | Record<string, unknown>;
  }): Promise<ToolsCallResult> {
    assertNoRouteOverride(input.arguments as Record<string, unknown>);
    const slugUrl = resolveExpertMcpSlugUrl(input.slug.trim());
    if (!slugUrl) {
      throw new HermesExpertsError("EXPERT_MCP_ENDPOINT_NOT_CONFIGURED", "Backend URL is not configured");
    }
    return this.postJsonRpc<ToolsCallResult>(slugUrl, {
      jsonrpc: "2.0",
      id: `call-${++rpcId}`,
      method: "tools/call",
      params: {
        name: input.skillName.trim(),
        arguments: input.arguments,
      },
    });
  }
}

export function getExpertMcpClient(): ExpertMcpClient {
  const baseUrl = resolveClientBaseUrl();
  if (!clientInstance || clientBaseUrl !== baseUrl) {
    clientInstance = new ExpertMcpClient(baseUrl, getMcpAccessToken);
    clientBaseUrl = baseUrl;
  }
  return clientInstance;
}

export async function getExpertGatewayHealth(): Promise<ExpertHealthResponse> {
  try {
    return await getExpertMcpClient().health();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: "unreachable", message };
  }
}

export async function initializeExpertMcp(): Promise<void> {
  await getExpertMcpClient().initializeRoot();
}

export async function listPublishedExpertsAndTeams(): Promise<ExpertMcpToolDescriptor[]> {
  const catalog = await getExpertMcpClient().listCatalog();
  return catalog.map((item) => ({
    name: item.remoteToolName,
    description: item.description,
    annotations: {
      kind: item.kind,
      slug: item.slug,
      displayName: item.displayName,
      category: item.category,
      tags: item.tags,
      status: item.status,
      publicSkillCount: item.publicSkillCount,
      callableSkillCount: item.callableSkillCount,
      orchestrationMode: item.orchestrationMode,
      riskLevel: item.riskLevel,
      approvalMode: item.approvalMode,
    },
  }));
}

export async function listCatalogSkills(slug: string): Promise<RemoteExpertSkill[]> {
  return getExpertMcpClient().listSkills(slug);
}

export async function listExpertSkills(slug: string): Promise<RemoteExpertSkill[]> {
  return listCatalogSkills(slug);
}

export async function resolveDefaultExpertSkill(
  slug: string,
  kind: "expert_skill" | "expert_team_skill" = "expert_skill",
): Promise<string | null> {
  const skills = await listCatalogSkills(slug);
  const filtered = skills.filter((s) => s.kind === kind || !s.kind);
  const enabled = filtered.find((s) => s.callEnabled);
  return enabled?.skillName ?? filtered[0]?.skillName ?? null;
}

export async function callExpertSkill(
  slug: string,
  skillName: string,
  input: { prompt: string; context?: RemoteRunContext },
  invocationType: "expert_skill" | "expert_team" = "expert_skill",
): Promise<ExpertMcpCallResult & { structuredContent?: ToolsCallResult["structuredContent"] }> {
  const trimmedSlug = slug.trim();
  const trimmedSkill = skillName.trim();
  if (!trimmedSlug) {
    return { ok: false, errorCode: "EXPERT_TOOL_NAME_REQUIRED", message: "slug is required" };
  }
  if (!trimmedSkill) {
    return { ok: false, errorCode: "EXPERT_TOOL_NAME_REQUIRED", message: "skillName is required" };
  }
  if (!input.prompt?.trim()) {
    return { ok: false, errorCode: "EXPERT_PROMPT_REQUIRED", message: "prompt is required" };
  }

  const started = Date.now();
  try {
    const result = await getExpertMcpClient().callSkill({
      slug: trimmedSlug,
      skillName: trimmedSkill,
      arguments: buildExpertToolArguments(input),
    });
    const contentText = extractTextContent(result);
    if (!contentText && !result.structuredContent) {
      return {
        ok: false,
        errorCode: "EXPERT_RESPONSE_EMPTY",
        message: "Expert MCP returned empty response",
        durationMs: Date.now() - started,
        invocationType,
      };
    }
    return {
      ok: true,
      contentText,
      structuredContent: result.structuredContent,
      durationMs: Date.now() - started,
      invocationType,
    };
  } catch (err) {
    if (err instanceof HermesExpertsError) {
      return {
        ok: false,
        errorCode: err.code,
        message: err.message,
        durationMs: Date.now() - started,
        invocationType,
        approvalRequired: err.code === "EXPERT_APPROVAL_REQUIRED",
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      errorCode: "EXPERT_MCP_CALL_FAILED",
      message,
      durationMs: Date.now() - started,
      invocationType,
    };
  }
}

export { extractTextContent as extractMcpTextContent };

/** @deprecated Use postJsonRpc on ExpertMcpClient */
export async function expertMcpRpc(
  slug: string | null,
  method: string,
  params?: Record<string, unknown>,
): Promise<unknown> {
  const client = getExpertMcpClient();
  const path = slug ? resolveExpertMcpSlugUrl(slug) : resolveExpertMcpRootUrl();
  if (!path) {
    throw new HermesExpertsError("EXPERT_MCP_ENDPOINT_NOT_CONFIGURED", "Backend URL is not configured");
  }
  return client.postJsonRpc(path, {
    jsonrpc: "2.0",
    id: ++rpcId,
    method,
    params,
  });
}
