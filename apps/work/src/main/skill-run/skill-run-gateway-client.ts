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
import { parseSkillCatalogTools } from "./skill-run-contract-parser";
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
        const res = await transport.authorizedFetch("/api/v1/mcp/tools", {
          method: "GET",
        });
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
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
        const data = (await res.json()) as {
          tools?: unknown;
          result?: { tools?: unknown };
        };
        const rawTools = Array.isArray(data.tools)
          ? data.tools
          : Array.isArray(data.result?.tools)
            ? data.result.tools
            : undefined;
        const parsed = parseSkillCatalogTools(rawTools);
        if (parsed.status === "contract-unsupported") {
          const unsupported: SkillCatalogResponse = {
            status: "contract-unsupported",
            tools: [],
            reason: parsed.reason,
          };
          cachedCatalogByScope.set(scopeKey, unsupported);
          return unsupported;
        }
        const ready: SkillCatalogResponse = {
          status: "ready",
          tools: parsed.tools,
        };
        cachedCatalogByScope.set(scopeKey, ready);
        return ready;
      } catch {
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

      const res = await transport.authorizedFetch("/api/v1/mcp/tools/call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": input.idempotencyKey,
        },
        body: JSON.stringify({
          name: input.toolName,
          arguments: { prompt: input.prompt },
        }),
      });

      if (!res.ok) {
        let errCode = "START_FAILED";
        let errMsg = `Start failed with status ${res.status}`;
        try {
          const body = (await res.json()) as { error?: string; message?: string };
          errMsg = body.message || body.error || errMsg;
        } catch {
          // ignore
        }
        throw new SkillRunGatewayError(errMsg, res.status, errCode);
      }

      const data = (await res.json()) as {
        run_id?: string;
        runId?: string;
        status?: string;
        event_stream_url?: string;
      };
      const runId = data.run_id || data.runId;
      if (!runId) {
        throw new SkillRunGatewayError("Invalid backend response: missing run_id", 502);
      }

      return {
        runId,
        status: data.status || "starting",
        eventStreamUrl: data.event_stream_url,
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
