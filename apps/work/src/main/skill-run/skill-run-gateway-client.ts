/**
 * Skill Run Gateway Client.
 * Responsible for MCP tools/list, tools/call, run status/SSE, cancel, and artifact discovery.
 * Strictly gated behind `hasSkillRunConsumerLock()`.
 */

import {
  AuthorizedBackendTransport,
  createAuthorizedBackendTransport,
} from "../auth/authorized-backend-transport";
import { readStoredSessionSync } from "../auth/token-store";
import { hasSkillRunConsumerLock } from "./skill-run-consumer-lock";
import { mapPublicSkillCatalogTools } from "./skill-run-contract-parser";
import type {
  SkillCatalogResponse,
  SkillRunArtifactDescriptor,
} from "../../shared/skill-run";

export class SkillRunGatewayError extends Error {
  readonly status: number;
  readonly errorCode?: string;

  constructor(message: string, status = 500, errorCode?: string) {
    super(message);
    this.name = "SkillRunGatewayError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

export interface SkillRunStartAcceptedResponse {
  runId: string;
  status: string;
  eventStreamUrl?: string;
}

export interface SkillRunSnapshotResponse {
  runId: string;
  status: string;
  resultText?: string;
  errorCode?: string;
  errorMessage?: string;
  artifacts?: SkillRunArtifactDescriptor[];
}

export interface SkillRunGatewayClient {
  listCatalog(): Promise<SkillCatalogResponse>;
  callSkill(input: {
    toolName: string;
    arguments: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<SkillRunStartAcceptedResponse>;
  getRunSnapshot(runId: string): Promise<SkillRunSnapshotResponse>;
  cancelRun(runId: string): Promise<void>;
  listRunArtifacts(runId: string): Promise<SkillRunArtifactDescriptor[]>;
  openEventStream(
    runId: string,
    options?: { lastEventId?: string; signal?: AbortSignal },
  ): Promise<Response>;
  hasConsumerLock(): boolean;
  clearCache(): void;
  dispose(): void;
}

export interface CreateSkillRunGatewayClientOptions {
  transport?: AuthorizedBackendTransport;
  hasConsumerLock?: boolean;
  getAuthScopeKey?: () => string;
}

export function createSkillRunGatewayClient(
  options: CreateSkillRunGatewayClientOptions = {},
): SkillRunGatewayClient {
  const transport = options.transport ?? createAuthorizedBackendTransport();
  const lockGate = options.hasConsumerLock ?? hasSkillRunConsumerLock();
  const resolveAuthScopeKey =
    options.getAuthScopeKey ??
    (() => {
      try {
        const base = transport.getBaseUrl();
        const userId = readStoredSessionSync()?.user?.id ?? "anonymous";
        return `${base}|user:${userId}`;
      } catch {
        const userId = readStoredSessionSync()?.user?.id ?? "anonymous";
        return `unknown|user:${userId}`;
      }
    });
  let disposed = false;
  const cachedCatalogByScope = new Map<string, SkillCatalogResponse>();
  /** Per-provider-run route hints. Hermes Task tools/call returns task_id + hermes paths. */
  const routesByRunId = new Map<
    string,
    {
      kind: "skill-run" | "hermes-task";
      eventPath: string;
      eventTokenPath?: string;
      snapshotPath: string;
      resultPath: string;
      artifactPath: string;
      cancelPath: string;
    }
  >();

  function assertNotDisposed(): void {
    if (disposed) {
      throw new Error("SkillRunGatewayClient is disposed");
    }
  }

  function assertLock(): void {
    if (!lockGate) {
      throw new SkillRunGatewayError(
        "Skill Run Consumer Contract lock is not available; production requests are disabled.",
        400,
        "CONTRACT_UNSUPPORTED",
      );
    }
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function toApiPath(value: unknown, fallback: string): string {
    if (typeof value !== "string" || !value.trim()) return fallback;
    const trimmed = value.trim();
    if (trimmed.startsWith("/")) return trimmed;
    try {
      const parsed = new URL(trimmed);
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return fallback;
    }
  }

  function defaultSkillRunRoutes(runId: string) {
    const enc = encodeURIComponent(runId);
    return {
      kind: "skill-run" as const,
      eventPath: `/api/v1/runs/${enc}/events`,
      snapshotPath: `/api/v1/runs/${enc}`,
      resultPath: `/api/v1/runs/${enc}`,
      artifactPath: `/api/v1/runs/${enc}/artifacts`,
      cancelPath: `/api/v1/runs/${enc}/cancel`,
    };
  }

  function defaultHermesTaskRoutes(taskId: string) {
    const enc = encodeURIComponent(taskId);
    return {
      kind: "hermes-task" as const,
      eventPath: `/api/v1/hermes/tasks/${enc}/events`,
      eventTokenPath: `/api/v1/hermes/tasks/${enc}/events-token`,
      snapshotPath: `/api/v1/hermes/tasks/${enc}`,
      resultPath: `/api/v1/hermes/tasks/${enc}/result`,
      artifactPath: `/api/v1/hermes/tasks/${enc}/artifacts`,
      cancelPath: `/api/v1/hermes/tasks/${enc}/cancel`,
    };
  }

  function resolveRoutes(runId: string) {
    return routesByRunId.get(runId) ?? defaultSkillRunRoutes(runId);
  }

  function normalizeArtifactList(body: unknown): SkillRunArtifactDescriptor[] {
    const rawList = isRecord(body)
      ? Array.isArray(body.artifacts)
        ? body.artifacts
        : Array.isArray(body.data)
          ? body.data
          : []
      : [];
    const out: SkillRunArtifactDescriptor[] = [];
    for (const item of rawList) {
      if (!isRecord(item) || typeof item.id !== "string") continue;
      const fileName =
        typeof item.file_name === "string"
          ? item.file_name
          : typeof item.title === "string"
            ? item.title
            : null;
      if (!fileName) continue;
      out.push({
        id: item.id,
        file_name: fileName,
        size_bytes:
          typeof item.size_bytes === "number" ? item.size_bytes : undefined,
        mime_type:
          typeof item.content_type === "string"
            ? item.content_type
            : typeof item.mime_type === "string"
              ? item.mime_type
              : undefined,
        sha256: typeof item.sha256 === "string" ? item.sha256 : undefined,
        preview_supported:
          typeof item.preview_supported === "boolean"
            ? item.preview_supported
            : undefined,
      });
    }
    return out;
  }

  function extractResultText(body: unknown): string | undefined {
    if (!isRecord(body)) return undefined;
    if (typeof body.result_text === "string") return body.result_text;
    if (typeof body.text === "string") return body.text;
    if (typeof body.content === "string") return body.content;
    if (typeof body.summary === "string") return body.summary;
    if (isRecord(body.result)) {
      if (typeof body.result.content === "string") return body.result.content;
      if (typeof body.result.summary === "string") return body.result.summary;
      if (typeof body.result.text === "string") return body.result.text;
    }
    if (isRecord(body.data)) {
      return extractResultText(body.data);
    }
    return undefined;
  }

  async function jsonRpc(
    method: string,
    params: Record<string, unknown>,
    options?: { idempotencyKey?: string },
  ): Promise<{ status: number; result: unknown }> {
    const res = await transport.authorizedFetch("/api/v1/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      idempotencyKey: options?.idempotencyKey,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `${method}-${Date.now()}`,
        method,
        params,
      }),
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      const errBody = isRecord(body) ? body : {};
      const message =
        (typeof errBody.message === "string" && errBody.message) ||
        (typeof errBody.error === "string" && errBody.error) ||
        `MCP ${method} failed with status ${res.status}`;
      const errorCode =
        typeof errBody.error_code === "string"
          ? errBody.error_code
          : res.status === 409
            ? "IDEMPOTENCY_CONFLICT"
            : "START_FAILED";
      throw new SkillRunGatewayError(message, res.status, errorCode);
    }
    if (isRecord(body) && isRecord(body.error)) {
      const rpcMessage =
        typeof body.error.message === "string"
          ? body.error.message
          : `JSON-RPC ${method} error`;
      throw new SkillRunGatewayError(rpcMessage, 200, "JSONRPC_ERROR");
    }
    const result = isRecord(body) && "result" in body ? body.result : body;
    return { status: res.status, result };
  }

  return {
    async listCatalog(): Promise<SkillCatalogResponse> {
      assertNotDisposed();
      const scopeKey = resolveAuthScopeKey();
      const cached = cachedCatalogByScope.get(scopeKey);
      if (cached) return cached;

      if (!lockGate) {
        const unsupported: SkillCatalogResponse = {
          status: "contract-unsupported",
          tools: [],
          reason: "Skill Run Consumer Contract lock is not available.",
        };
        cachedCatalogByScope.set(scopeKey, unsupported);
        return unsupported;
      }

      try {
        const { result } = await jsonRpc("tools/list", {});
        if (!isRecord(result) || !Array.isArray(result.tools)) {
          const unsupported: SkillCatalogResponse = {
            status: "contract-unsupported",
            tools: [],
            reason:
              "Skill Run Catalog response is missing a tools array.",
          };
          cachedCatalogByScope.set(scopeKey, unsupported);
          return unsupported;
        }
        const toolsRaw = result.tools;
        for (const raw of toolsRaw) {
          if (
            !isRecord(raw) ||
            typeof raw.capabilityKind !== "string" ||
            !raw.capabilityKind.trim()
          ) {
            const unsupported: SkillCatalogResponse = {
              status: "contract-unsupported",
              tools: [],
              reason:
                "Skill Run Catalog tools are missing the capabilityKind discriminator.",
            };
            cachedCatalogByScope.set(scopeKey, unsupported);
            return unsupported;
          }
        }
        const tools = mapPublicSkillCatalogTools(toolsRaw);
        const ready: SkillCatalogResponse = { status: "ready", tools };
        cachedCatalogByScope.set(scopeKey, ready);
        return ready;
      } catch (err) {
        if (err instanceof SkillRunGatewayError && (err.status === 401 || err.status === 403)) {
          const unauthorized: SkillCatalogResponse = {
            status: "unauthorized",
            tools: [],
          };
          cachedCatalogByScope.set(scopeKey, unauthorized);
          return unauthorized;
        }
        const unavailable: SkillCatalogResponse = {
          status: "backend-unavailable",
          tools: [],
        };
        cachedCatalogByScope.set(scopeKey, unavailable);
        return unavailable;
      }
    },

    async callSkill(input: {
      toolName: string;
      arguments: Record<string, unknown>;
      idempotencyKey: string;
    }): Promise<SkillRunStartAcceptedResponse> {
      assertNotDisposed();
      assertLock();

      const { result } = await jsonRpc(
        "tools/call",
        {
          name: input.toolName,
          arguments: input.arguments,
        },
        { idempotencyKey: input.idempotencyKey },
      );

      // v1.2.1 accepted result nests run identity under structuredContent
      // (see contracts/skill-run/v1.2.1/fixtures/tools-call-accepted.json).
      // Provider transitional path may return HermesTask task_id + hermes URLs;
      // Skill Run owns lifecycle and maps that transport without calling Expert.
      const data = isRecord(result) ? result : {};
      const structured = isRecord(data.structuredContent)
        ? data.structuredContent
        : null;

      if (process.env.SMC_SKILL_RUN_DEBUG === "1") {
        // eslint-disable-next-line no-console
        console.error(
          "[skill-run][callSkill] tools/call raw result:",
          JSON.stringify(result, null, 2),
        );
        // eslint-disable-next-line no-debugger
        debugger;
      }

      const skillRunId =
        (structured && typeof structured.run_id === "string" && structured.run_id) ||
        (structured && typeof structured.runId === "string" && structured.runId) ||
        (typeof data.run_id === "string" && data.run_id) ||
        (typeof data.runId === "string" && data.runId) ||
        "";
      const hermesTaskId =
        structured && typeof structured.task_id === "string"
          ? structured.task_id.trim()
          : "";

      let runId = skillRunId;
      let routes = runId ? defaultSkillRunRoutes(runId) : null;

      if (!runId && hermesTaskId) {
        runId = hermesTaskId;
        const hermesDefaults = defaultHermesTaskRoutes(runId);
        routes = {
          kind: "hermes-task",
          eventPath: toApiPath(
            structured?.event_url ?? structured?.event_stream,
            hermesDefaults.eventPath,
          ),
          eventTokenPath: toApiPath(
            structured?.event_token_url,
            hermesDefaults.eventTokenPath,
          ),
          snapshotPath: hermesDefaults.snapshotPath,
          resultPath: toApiPath(structured?.result_url, hermesDefaults.resultPath),
          artifactPath: toApiPath(
            structured?.artifact_url,
            hermesDefaults.artifactPath,
          ),
          cancelPath: hermesDefaults.cancelPath,
        };
        // eslint-disable-next-line no-console
        console.warn(
          "[skill-run][callSkill] Provider returned HermesTask envelope; bridging transport under Skill Run owner",
          { toolName: input.toolName, taskId: runId },
        );
      } else if (runId && structured) {
        routes = {
          ...defaultSkillRunRoutes(runId),
          eventPath: toApiPath(
            structured.event_stream ?? structured.event_stream_url,
            defaultSkillRunRoutes(runId).eventPath,
          ),
          resultPath: toApiPath(
            structured.result_url,
            defaultSkillRunRoutes(runId).resultPath,
          ),
          artifactPath: toApiPath(
            structured.artifact_url,
            defaultSkillRunRoutes(runId).artifactPath,
          ),
        };
      }

      if (!runId || !routes) {
        // eslint-disable-next-line no-console
        console.error(
          "[skill-run][callSkill] missing run_id/task_id — inspect tools/call result shape:",
          JSON.stringify(result, null, 2),
        );
        // eslint-disable-next-line no-debugger
        debugger;
        throw new SkillRunGatewayError(
          "Invalid backend response: missing structuredContent.run_id (or transitional task_id)",
          502,
          "SKILL_UNSUPPORTED_SCHEMA",
        );
      }

      routesByRunId.set(runId, routes);

      const status =
        (structured && typeof structured.status === "string" && structured.status) ||
        (typeof data.status === "string" && data.status) ||
        "starting";

      return {
        runId,
        status,
        eventStreamUrl: routes.eventPath,
      };
    },

    async getRunSnapshot(runId: string): Promise<SkillRunSnapshotResponse> {
      assertNotDisposed();
      assertLock();

      const routes = resolveRoutes(runId);
      const res = await transport.authorizedFetch(routes.snapshotPath, {
        method: "GET",
      });

      if (!res.ok) {
        throw new SkillRunGatewayError(`Get run snapshot failed: ${res.status}`, res.status);
      }

      const body = (await res.json()) as unknown;
      const data = isRecord(body)
        ? isRecord(body.data)
          ? { ...body, ...body.data }
          : isRecord(body.task)
            ? { ...body, ...body.task }
            : body
        : {};

      let resultText = extractResultText(data);
      const status =
        (typeof data.status === "string" && data.status) ||
        "running";
      const normalizedStatus = status.toLowerCase();
      if (
        !resultText &&
        routes.kind === "hermes-task" &&
        (normalizedStatus === "succeeded" ||
          normalizedStatus === "completed" ||
          normalizedStatus === "success")
      ) {
        try {
          const resultRes = await transport.authorizedFetch(routes.resultPath, {
            method: "GET",
          });
          if (resultRes.ok) {
            resultText = extractResultText(await resultRes.json());
          }
        } catch {
          // keep snapshot-only view
        }
      }

      return {
        runId:
          (typeof data.id === "string" && data.id) ||
          (typeof data.run_id === "string" && data.run_id) ||
          (typeof data.task_id === "string" && data.task_id) ||
          runId,
        status,
        resultText,
        errorCode:
          typeof data.error_code === "string" ? data.error_code : undefined,
        errorMessage:
          typeof data.error_message === "string"
            ? data.error_message
            : typeof data.message === "string"
              ? data.message
              : undefined,
        artifacts: normalizeArtifactList(data),
      };
    },

    async cancelRun(runId: string): Promise<void> {
      assertNotDisposed();
      assertLock();

      const routes = resolveRoutes(runId);
      const res = await transport.authorizedFetch(routes.cancelPath, {
        method: "POST",
      });

      if (!res.ok && res.status !== 404 && res.status !== 409) {
        throw new SkillRunGatewayError(`Cancel run failed: ${res.status}`, res.status);
      }
    },

    async listRunArtifacts(runId: string): Promise<SkillRunArtifactDescriptor[]> {
      assertNotDisposed();
      assertLock();

      const routes = resolveRoutes(runId);
      const res = await transport.authorizedFetch(routes.artifactPath, {
        method: "GET",
      });

      if (!res.ok) {
        if (res.status === 404) return [];
        throw new SkillRunGatewayError(`List artifacts failed: ${res.status}`, res.status);
      }

      return normalizeArtifactList(await res.json());
    },

    async openEventStream(
      runId: string,
      options: { lastEventId?: string; signal?: AbortSignal } = {},
    ): Promise<Response> {
      assertNotDisposed();
      assertLock();

      const routes = resolveRoutes(runId);
      let eventPath = routes.eventPath;
      if (routes.eventTokenPath) {
        try {
          const tokenRes = await transport.authorizedFetch(routes.eventTokenPath, {
            method: "GET",
            signal: options.signal,
          });
          if (tokenRes.ok) {
            const tokenBody = (await tokenRes.json()) as unknown;
            const tokenData = isRecord(tokenBody)
              ? isRecord(tokenBody.data)
                ? tokenBody.data
                : tokenBody
              : null;
            if (tokenData && typeof tokenData.event_url === "string") {
              eventPath = toApiPath(tokenData.event_url, eventPath);
            }
          }
        } catch {
          // Fall back to static eventPath when token exchange fails.
        }
      }

      const headers: Record<string, string> = {
        Accept: "text/event-stream",
      };
      if (options.lastEventId) {
        headers["Last-Event-ID"] = options.lastEventId;
      }

      return transport.authorizedFetch(eventPath, {
        method: "GET",
        headers,
        signal: options.signal,
      });
    },

    hasConsumerLock(): boolean {
      return lockGate;
    },

    clearCache(): void {
      cachedCatalogByScope.clear();
      routesByRunId.clear();
    },

    dispose(): void {
      disposed = true;
      cachedCatalogByScope.clear();
      routesByRunId.clear();
    },
  };
}
