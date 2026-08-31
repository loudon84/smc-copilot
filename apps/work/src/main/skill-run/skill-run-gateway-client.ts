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
    prompt: string;
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
        const toolsRaw =
          isRecord(result) && Array.isArray(result.tools) ? result.tools : [];
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
      prompt: string;
      idempotencyKey: string;
    }): Promise<SkillRunStartAcceptedResponse> {
      assertNotDisposed();
      assertLock();

      const { result } = await jsonRpc(
        "tools/call",
        {
          name: input.toolName,
          arguments: { prompt: input.prompt },
        },
        { idempotencyKey: input.idempotencyKey },
      );

      const data = isRecord(result) ? result : {};
      const runId =
        (typeof data.run_id === "string" && data.run_id) ||
        (typeof data.runId === "string" && data.runId) ||
        "";
      if (!runId) {
        throw new SkillRunGatewayError("Invalid backend response: missing run_id", 502);
      }

      return {
        runId,
        status: typeof data.status === "string" ? data.status : "starting",
        eventStreamUrl:
          typeof data.event_stream_url === "string" ? data.event_stream_url : undefined,
      };
    },

    async getRunSnapshot(runId: string): Promise<SkillRunSnapshotResponse> {
      assertNotDisposed();
      assertLock();

      const res = await transport.authorizedFetch(`/api/v1/runs/${encodeURIComponent(runId)}`, {
        method: "GET",
      });

      if (!res.ok) {
        throw new SkillRunGatewayError(`Get run snapshot failed: ${res.status}`, res.status);
      }

      const data = (await res.json()) as {
        id?: string;
        run_id?: string;
        status?: string;
        result_text?: string;
        text?: string;
        error_code?: string;
        error_message?: string;
        artifacts?: SkillRunArtifactDescriptor[];
      };

      return {
        runId: data.id || data.run_id || runId,
        status: data.status || "running",
        resultText: data.result_text || data.text,
        errorCode: data.error_code,
        errorMessage: data.error_message,
        artifacts: data.artifacts,
      };
    },

    async cancelRun(runId: string): Promise<void> {
      assertNotDisposed();
      assertLock();

      const res = await transport.authorizedFetch(`/api/v1/runs/${encodeURIComponent(runId)}/cancel`, {
        method: "POST",
      });

      if (!res.ok && res.status !== 404 && res.status !== 409) {
        throw new SkillRunGatewayError(`Cancel run failed: ${res.status}`, res.status);
      }
    },

    async listRunArtifacts(runId: string): Promise<SkillRunArtifactDescriptor[]> {
      assertNotDisposed();
      assertLock();

      const res = await transport.authorizedFetch(`/api/v1/runs/${encodeURIComponent(runId)}/artifacts`, {
        method: "GET",
      });

      if (!res.ok) {
        if (res.status === 404) return [];
        throw new SkillRunGatewayError(`List artifacts failed: ${res.status}`, res.status);
      }

      const data = (await res.json()) as { artifacts?: SkillRunArtifactDescriptor[] };
      return Array.isArray(data.artifacts) ? data.artifacts : [];
    },

    async openEventStream(
      runId: string,
      options: { lastEventId?: string; signal?: AbortSignal } = {},
    ): Promise<Response> {
      assertNotDisposed();
      assertLock();

      const headers: Record<string, string> = {
        Accept: "text/event-stream",
      };
      if (options.lastEventId) {
        headers["Last-Event-ID"] = options.lastEventId;
      }

      return transport.authorizedFetch(`/api/v1/runs/${encodeURIComponent(runId)}/events`, {
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
    },

    dispose(): void {
      disposed = true;
      cachedCatalogByScope.clear();
    },
  };
}
