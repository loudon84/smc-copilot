/**
 * Trusted Main-process NoDeskClaw Expert HTTP owner.
 * Catalog/Skill TTL cache + exact tools/call + HermesTask endpoints.
 * Renderer never sees URLs or tokens.
 */

import {
  getDefaultAuthEndpointConfig,
  readAuthEndpointConfig,
} from "../auth/auth-endpoint-config-store";
import {
  ensureFreshAccessToken,
  isAuthExpiredMessage,
  refreshStoredAccessToken,
} from "../auth/ensure-access-token";
import { getCachedAccessToken } from "../auth/token-store";
import {
  AuthorizedBackendTransportError,
  createAuthorizedBackendTransport,
} from "../auth/authorized-backend-transport";
import { normalizeBackendBaseUrl } from "../../shared/auth/auth-url";
import type {
  ExpertAcceptedStructuredContent,
  ExpertApiErrorBody,
  ExpertArtifactDescriptor,
  ExpertArtifactPreviewData,
  ExpertCatalogItem,
  ExpertEventsToken,
  ExpertHealthResponse,
  ExpertJsonRpcError,
  ExpertSkillItem,
  HermesTaskRead,
  HermesTaskResult,
  HermesTaskSnapshot,
} from "../../shared/expert";
import {
  canSilentCallExpertSkill,
  extractJsonRpcErrorCode,
  WORK_EXPERT_CONTRACT_VERSION,
} from "../../shared/expert";

const CATALOG_TTL_MS = 60_000;
const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

export class ExpertGatewayError extends Error {
  readonly status: number;
  readonly errorCode: string | null;
  readonly body: unknown;

  constructor(
    message: string,
    options: { status: number; errorCode?: string | null; body?: unknown },
  ) {
    super(message);
    this.name = "ExpertGatewayError";
    this.status = options.status;
    this.errorCode = options.errorCode ?? null;
    this.body = options.body;
  }
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface ExpertGatewayClient {
  listCatalog(): Promise<ExpertCatalogItem[]>;
  listSkills(expertSlug: string): Promise<ExpertSkillItem[]>;
  getHealth(): Promise<ExpertHealthResponse>;
  callSkill(input: {
    expertSlug: string;
    skillName: string;
    prompt: string;
    idempotencyKey: string;
  }): Promise<ExpertAcceptedStructuredContent>;
  getTask(taskId: string): Promise<HermesTaskRead>;
  getSnapshot(taskId: string): Promise<HermesTaskSnapshot>;
  getResult(taskId: string): Promise<HermesTaskResult>;
  listArtifacts(taskId: string): Promise<ExpertArtifactDescriptor[]>;
  getArtifactPreview(artifactId: string): Promise<ExpertArtifactPreviewData>;
  getEventsToken(taskId: string): Promise<ExpertEventsToken>;
  cancelTask(taskId: string): Promise<unknown>;
  retryTask(taskId: string): Promise<unknown>;
  /** Build same-origin artifact download URL from artifact_id only. */
  buildArtifactDownloadPath(artifactId: string): string;
  /** Build same-origin artifact preview URL from artifact_id only. */
  buildArtifactPreviewPath(artifactId: string): string;
  /** Build same-origin events SSE URL path (relative). */
  buildEventsPath(taskId: string): string;
  getBaseUrl(): string;
  getAccessToken(): string;
  openAuthorizedGet(
    pathOrUrl: string,
    init?: { headers?: Record<string, string>; signal?: AbortSignal },
  ): Promise<Response>;
  clearCache(): void;
  dispose(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function artifactPreviewPath(artifactId: string): string {
  return `/api/v1/hermes/artifacts/${encodeURIComponent(artifactId)}/preview`;
}

function artifactDownloadPath(artifactId: string): string {
  return `/api/v1/hermes/artifacts/${encodeURIComponent(artifactId)}/download`;
}

function resolveBaseUrl(): string {
  const config = readAuthEndpointConfig() ?? getDefaultAuthEndpointConfig();
  return normalizeBackendBaseUrl(config.backendUrl);
}

function requireAccessToken(): string {
  const token = getCachedAccessToken();
  if (!token) {
    throw new ExpertGatewayError("Not authenticated", {
      status: 401,
      errorCode: "UNAUTHORIZED",
    });
  }
  return token;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function parseApiError(status: number, body: unknown): ExpertGatewayError {
  if (isRecord(body)) {
    const message =
      typeof body.message === "string"
        ? body.message
        : `Expert API error: ${status}`;
    const errorCode =
      typeof body.message_key === "string"
        ? body.message_key
        : typeof body.error_code === "number"
          ? String(body.error_code)
          : null;
    return new ExpertGatewayError(message, {
      status,
      errorCode,
      body: body as unknown as ExpertApiErrorBody,
    });
  }
  return new ExpertGatewayError(`Expert API error: ${status}`, {
    status,
    body,
  });
}

function unwrapApiData<T>(body: unknown): T {
  if (!isRecord(body)) {
    throw new ExpertGatewayError("Invalid API response", {
      status: 500,
      body,
    });
  }
  if (typeof body.code === "number" && body.code !== 0) {
    throw parseApiError(400, body);
  }
  return body.data as T;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function parseCatalogTools(result: unknown): ExpertCatalogItem[] {
  if (!isRecord(result) || !Array.isArray(result.tools)) return [];
  const out: ExpertCatalogItem[] = [];
  for (const tool of result.tools) {
    if (!isRecord(tool) || typeof tool.name !== "string") continue;
    const annotations = isRecord(tool.annotations) ? tool.annotations : {};
    const kind = annotations.kind;
    if (kind !== "expert" && kind !== "expert_team") continue;
    const slug = annotations.slug;
    if (typeof slug !== "string" || slug.trim() === "") continue;
    if (
      !isNonNegativeInteger(annotations.publicSkillCount) ||
      !isNonNegativeInteger(annotations.callableSkillCount)
    ) {
      continue;
    }
    const displayName =
      typeof annotations.displayName === "string" &&
      annotations.displayName.trim() !== ""
        ? annotations.displayName
        : undefined;
    const status =
      typeof annotations.status === "string" ? annotations.status : undefined;
    out.push({
      name: tool.name,
      description:
        typeof tool.description === "string" ? tool.description : undefined,
      slug,
      kind,
      displayName,
      status,
      publicSkillCount: annotations.publicSkillCount,
      callableSkillCount: annotations.callableSkillCount,
      inputSchema: isRecord(tool.inputSchema)
        ? (tool.inputSchema as Record<string, unknown>)
        : undefined,
    });
  }
  return out;
}

function parseSkillTools(result: unknown): ExpertSkillItem[] {
  if (!isRecord(result) || !Array.isArray(result.tools)) return [];
  const out: ExpertSkillItem[] = [];
  for (const tool of result.tools) {
    if (
      !isRecord(tool) ||
      typeof tool.name !== "string" ||
      tool.name.trim() === ""
    ) {
      continue;
    }
    const annotations = isRecord(tool.annotations) ? tool.annotations : {};
    const status =
      typeof annotations.status === "string" ? annotations.status : undefined;
    const callEnabled = annotations.callEnabled === true;
    const riskLevel =
      typeof annotations.riskLevel === "string" ? annotations.riskLevel : null;
    const approvalMode =
      typeof annotations.approvalMode === "string"
        ? annotations.approvalMode
        : null;
    const displayName =
      typeof annotations.displayName === "string" &&
      annotations.displayName.trim() !== ""
        ? annotations.displayName
        : undefined;
    out.push({
      name: tool.name,
      description:
        typeof tool.description === "string" ? tool.description : undefined,
      displayName,
      status,
      callEnabled,
      riskLevel,
      approvalMode,
      inputSchema: isRecord(tool.inputSchema)
        ? (tool.inputSchema as Record<string, unknown>)
        : undefined,
    });
  }
  return out;
}

async function parseHealthResponse(
  res: Response,
): Promise<ExpertHealthResponse> {
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    throw new ExpertGatewayError("Invalid health JSON", {
      status: res.status,
      errorCode: "INVALID_HEALTH_PAYLOAD",
      body: text,
    });
  }
  if (
    !isRecord(body) ||
    typeof body.ok !== "boolean" ||
    typeof body.status !== "string" ||
    !isRecord(body.gateway) ||
    !isRecord(body.catalog)
  ) {
    throw new ExpertGatewayError("Invalid health payload", {
      status: res.status,
      errorCode: "INVALID_HEALTH_PAYLOAD",
      body,
    });
  }
  return {
    ok: body.ok,
    status: body.status,
    gateway: body.gateway as Record<string, unknown>,
    catalog: body.catalog as Record<string, unknown>,
  };
}

function parseAcceptedStructuredContent(
  result: unknown,
): ExpertAcceptedStructuredContent {
  if (!isRecord(result) || !isRecord(result.structuredContent)) {
    throw new ExpertGatewayError("Missing structuredContent in tools/call", {
      status: 500,
      body: result,
    });
  }
  const sc = result.structuredContent;
  const required = [
    "task_id",
    "event_stream",
    "event_token_url",
    "result_url",
    "artifact_url",
  ] as const;
  for (const key of required) {
    if (typeof sc[key] !== "string" || !sc[key]) {
      throw new ExpertGatewayError(`Missing structuredContent.${key}`, {
        status: 500,
        body: sc,
      });
    }
  }
  return {
    committed: sc.committed === true,
    task_id: String(sc.task_id),
    task_no: typeof sc.task_no === "string" ? sc.task_no : undefined,
    status: typeof sc.status === "string" ? sc.status : "running",
    event_stream: String(sc.event_stream),
    event_url: typeof sc.event_url === "string" ? sc.event_url : undefined,
    event_token_url: String(sc.event_token_url),
    result_url: String(sc.result_url),
    artifact_url: String(sc.artifact_url),
    wait_strategy: isRecord(sc.wait_strategy)
      ? (sc.wait_strategy as unknown as ExpertAcceptedStructuredContent["wait_strategy"])
      : { type: "sse", fallback: "poll" },
    catalog_slug:
      typeof sc.catalog_slug === "string" ? sc.catalog_slug : undefined,
    skill_name: typeof sc.skill_name === "string" ? sc.skill_name : undefined,
    invocation_id:
      typeof sc.invocation_id === "string" ? sc.invocation_id : undefined,
  };
}

function isAuthExpiredGatewayError(err: unknown): boolean {
  if (!(err instanceof ExpertGatewayError)) return false;
  if (err.status === 401) return true;
  if (
    err.errorCode === "MCP_AUTH_REQUIRED" ||
    err.errorCode === "UNAUTHORIZED" ||
    err.errorCode === "AUTHENTICATION_EXPIRED"
  ) {
    return true;
  }
  return isAuthExpiredMessage(err.message);
}

export function createExpertGatewayClient(
  options: {
    fetchImpl?: typeof fetch;
    now?: () => number;
    catalogTtlMs?: number;
    ensureAccessToken?: () => Promise<string>;
    refreshAccessToken?: () => Promise<string>;
  } = {},
): ExpertGatewayClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const catalogTtlMs = options.catalogTtlMs ?? CATALOG_TTL_MS;
  const ensureAccessToken = options.ensureAccessToken ?? ensureFreshAccessToken;
  const refreshAccessToken =
    options.refreshAccessToken ?? refreshStoredAccessToken;

  let disposed = false;
  let catalogCache: CacheEntry<ExpertCatalogItem[]> | null = null;
  const skillCache = new Map<string, CacheEntry<ExpertSkillItem[]>>();

  const transport = createAuthorizedBackendTransport({
    fetchImpl,
    ensureAccessToken,
    refreshAccessToken,
    timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
  });

  function assertNotDisposed(): void {
    if (disposed) {
      throw new ExpertGatewayError("Expert gateway disposed", {
        status: 503,
        errorCode: "DISPOSED",
      });
    }
  }

  async function withAuthRetry<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (err) {
      if (!isAuthExpiredGatewayError(err)) throw err;
      await refreshAccessToken();
      return await op();
    }
  }

  async function authorizedFetch(
    pathOrUrl: string,
    init: RequestInit & { idempotencyKey?: string } = {},
  ): Promise<Response> {
    assertNotDisposed();
    try {
      return await transport.authorizedFetch(pathOrUrl, init);
    } catch (err) {
      if (err instanceof ExpertGatewayError) throw err;
      if (err instanceof AuthorizedBackendTransportError) {
        throw new ExpertGatewayError(err.message, {
          status: err.status,
          errorCode: err.errorCode,
          body: err.body,
        });
      }
      throw err;
    }
  }

  async function jsonRpcOnce(
    path: string,
    method: string,
    params: Record<string, unknown> | undefined,
    options?: { idempotencyKey?: string },
  ): Promise<unknown> {
    const res = await authorizedFetch(path, {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `${method}-${now()}`,
        method,
        params: params ?? {},
      }),
      idempotencyKey: options?.idempotencyKey,
    });
    const body = await readJson(res);
    if (!res.ok) {
      throw parseApiError(res.status, body);
    }
    if (!isRecord(body)) {
      throw new ExpertGatewayError("Invalid JSON-RPC response", {
        status: res.status,
        body,
      });
    }
    if (isRecord(body.error)) {
      const rpcError = body.error as unknown as ExpertJsonRpcError;
      throw new ExpertGatewayError(rpcError.message || "JSON-RPC error", {
        status: 200,
        errorCode: extractJsonRpcErrorCode(rpcError),
        body,
      });
    }
    return body.result;
  }

  async function jsonRpc(
    path: string,
    method: string,
    params: Record<string, unknown> | undefined,
    options?: { idempotencyKey?: string },
  ): Promise<unknown> {
    return withAuthRetry(() => jsonRpcOnce(path, method, params, options));
  }

  async function httpGetData<T>(path: string): Promise<T> {
    return withAuthRetry(async () => {
      const res = await authorizedFetch(path, { method: "GET" });
      const body = await readJson(res);
      if (!res.ok) {
        throw parseApiError(res.status, body);
      }
      return unwrapApiData<T>(body);
    });
  }

  async function httpPostData(path: string): Promise<unknown> {
    return withAuthRetry(async () => {
      const res = await authorizedFetch(path, { method: "POST", body: "{}" });
      const body = await readJson(res);
      if (!res.ok) {
        throw parseApiError(res.status, body);
      }
      if (isRecord(body) && "data" in body) {
        return unwrapApiData(body);
      }
      return body;
    });
  }

  const client: ExpertGatewayClient = {
    async listCatalog(): Promise<ExpertCatalogItem[]> {
      assertNotDisposed();
      if (catalogCache && catalogCache.expiresAt > now()) {
        return catalogCache.value;
      }
      const result = await jsonRpc("/api/v1/expert/mcp", "tools/list", {});
      const items = parseCatalogTools(result);
      catalogCache = { value: items, expiresAt: now() + catalogTtlMs };
      return items;
    },

    async listSkills(expertSlug: string): Promise<ExpertSkillItem[]> {
      assertNotDisposed();
      const slug = expertSlug.trim();
      if (!slug) {
        throw new ExpertGatewayError("expertSlug is required", { status: 400 });
      }
      const cached = skillCache.get(slug);
      if (cached && cached.expiresAt > now()) {
        return cached.value;
      }
      const result = await jsonRpc(
        `/api/v1/expert/mcp/${encodeURIComponent(slug)}`,
        "tools/list",
        {},
      );
      const items = parseSkillTools(result);
      skillCache.set(slug, { value: items, expiresAt: now() + catalogTtlMs });
      return items;
    },

    async getHealth(): Promise<ExpertHealthResponse> {
      assertNotDisposed();
      const res = await client.openAuthorizedGet("/api/v1/expert/health");
      if (!res.ok) {
        const body = await readJson(res);
        throw parseApiError(res.status, body);
      }
      return parseHealthResponse(res);
    },

    async callSkill(input): Promise<ExpertAcceptedStructuredContent> {
      assertNotDisposed();
      const expertSlug = input.expertSlug.trim();
      const skillName = input.skillName.trim();
      if (!expertSlug || !skillName) {
        throw new ExpertGatewayError("expertSlug and skillName are required", {
          status: 400,
        });
      }

      const health = await client.getHealth();
      if (health.ok !== true) {
        throw new ExpertGatewayError("Expert gateway is not healthy", {
          status: 503,
          errorCode: "GATEWAY_UNHEALTHY",
          body: health,
        });
      }

      const catalog = await client.listCatalog();
      const catalogItem = catalog.find((item) => item.slug === expertSlug);
      if (!catalogItem || catalogItem.status !== "ready") {
        throw new ExpertGatewayError("Expert catalog item is not ready", {
          status: 403,
          errorCode: "CATALOG_NOT_READY",
        });
      }

      const skills = await client.listSkills(expertSlug);
      const skillItem = skills.find((item) => item.name === skillName);
      if (
        !skillItem ||
        canSilentCallExpertSkill(catalogItem, skillItem) !== true
      ) {
        throw new ExpertGatewayError("Skill is not silently callable", {
          status: 403,
          errorCode: "SILENT_CALL_DENIED",
        });
      }

      const result = await jsonRpc(
        `/api/v1/expert/mcp/${encodeURIComponent(expertSlug)}`,
        "tools/call",
        {
          name: skillName,
          arguments: { prompt: input.prompt },
        },
        { idempotencyKey: input.idempotencyKey },
      );
      return parseAcceptedStructuredContent(result);
    },

    getTask(taskId: string): Promise<HermesTaskRead> {
      return httpGetData(`/api/v1/hermes/tasks/${encodeURIComponent(taskId)}`);
    },

    getSnapshot(taskId: string): Promise<HermesTaskSnapshot> {
      return httpGetData(
        `/api/v1/hermes/tasks/${encodeURIComponent(taskId)}/snapshot`,
      );
    },

    getResult(taskId: string): Promise<HermesTaskResult> {
      return httpGetData(
        `/api/v1/hermes/tasks/${encodeURIComponent(taskId)}/result`,
      );
    },

    async listArtifacts(taskId: string): Promise<ExpertArtifactDescriptor[]> {
      return withAuthRetry(async () => {
        const res = await authorizedFetch(
          `/api/v1/hermes/tasks/${encodeURIComponent(taskId)}/artifacts`,
          { method: "GET" },
        );
        const body = await readJson(res);
        if (!res.ok) {
          throw parseApiError(res.status, body);
        }
        if (isRecord(body) && Array.isArray(body.data)) {
          return body.data as ExpertArtifactDescriptor[];
        }
        return unwrapApiData<ExpertArtifactDescriptor[]>(body);
      });
    },

    async getArtifactPreview(
      artifactId: string,
    ): Promise<ExpertArtifactPreviewData> {
      return withAuthRetry(async () => {
        const res = await authorizedFetch(artifactPreviewPath(artifactId), {
          method: "GET",
        });
        const body = await readJson(res);
        if (!res.ok) {
          throw parseApiError(res.status, body);
        }
        const data = isRecord(body) && "data" in body ? body.data : body;
        if (!isRecord(data) || typeof data.content !== "string") {
          throw new ExpertGatewayError("Invalid artifact preview payload", {
            status: res.status || 500,
            errorCode: "INVALID_PREVIEW_PAYLOAD",
            body,
          });
        }
        return {
          content: data.content,
          content_type:
            typeof data.content_type === "string" ? data.content_type : null,
          truncated: data.truncated === true,
          encoding: typeof data.encoding === "string" ? data.encoding : null,
        };
      });
    },

    getEventsToken(taskId: string): Promise<ExpertEventsToken> {
      return httpGetData(
        `/api/v1/hermes/tasks/${encodeURIComponent(taskId)}/events-token`,
      );
    },

    cancelTask(taskId: string): Promise<unknown> {
      return httpPostData(
        `/api/v1/hermes/tasks/${encodeURIComponent(taskId)}/cancel`,
      );
    },

    retryTask(taskId: string): Promise<unknown> {
      return httpPostData(
        `/api/v1/hermes/tasks/${encodeURIComponent(taskId)}/retry`,
      );
    },

    buildArtifactDownloadPath(artifactId: string): string {
      return artifactDownloadPath(artifactId);
    },

    buildArtifactPreviewPath(artifactId: string): string {
      return artifactPreviewPath(artifactId);
    },

    buildEventsPath(taskId: string): string {
      return `/api/v1/hermes/tasks/${encodeURIComponent(taskId)}/events`;
    },

    getBaseUrl(): string {
      return resolveBaseUrl();
    },

    getAccessToken(): string {
      return requireAccessToken();
    },

    openAuthorizedGet(pathOrUrl, init = {}): Promise<Response> {
      return withAuthRetry(async () => {
        const res = await authorizedFetch(pathOrUrl, {
          method: "GET",
          headers: init.headers,
          signal: init.signal,
          redirect: "error",
        });
        if (res.status === 401) {
          const body = await readJson(res);
          throw parseApiError(res.status, body);
        }
        return res;
      });
    },

    clearCache(): void {
      catalogCache = null;
      skillCache.clear();
    },

    dispose(): void {
      disposed = true;
      catalogCache = null;
      skillCache.clear();
    },
  };

  void WORK_EXPERT_CONTRACT_VERSION;
  return client;
}

let singleton: ExpertGatewayClient | null = null;

export function getExpertGatewayClient(): ExpertGatewayClient {
  if (!singleton) {
    singleton = createExpertGatewayClient();
  }
  return singleton;
}

export function resetExpertGatewayClientForTests(): void {
  singleton?.dispose();
  singleton = null;
}
