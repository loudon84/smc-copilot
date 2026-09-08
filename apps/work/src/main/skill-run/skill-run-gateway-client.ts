/**
 * Skill Run Gateway Client.
 * Responsible for MCP tools/list, tools/call, run status/SSE, cancel, artifacts,
 * and v1.3.0 canonical approval decision.
 * Strictly gated behind `hasSkillRunConsumerLock()` for P0 HTTP;
 * decision HTTP is additionally gated by `hasSkillRunApprovalDecisionBundle()`.
 */

import {
  AuthorizedBackendTransport,
  createAuthorizedBackendTransport,
} from "../auth/authorized-backend-transport";
import { readStoredSessionSync } from "../auth/token-store";
import {
  hasSkillRunApprovalDecisionBundle,
  hasSkillRunConsumerLock,
} from "./skill-run-consumer-lock";
import {
  mapPublicArtifactList,
  mapPublicSkillCatalogTools,
} from "./skill-run-contract-parser";
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

export interface SkillRunApprovalDecisionReceipt {
  runId: string;
  approvalId: string;
  decision: "allow" | "deny";
  status: string;
  decidedAt: string;
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
  hasApprovalDecisionBundle(): boolean;
  decideApproval(input: {
    runId: string;
    approvalId: string;
    decision: "allow" | "deny";
    idempotencyKey: string;
  }): Promise<SkillRunApprovalDecisionReceipt>;
  getAuthScopeKey?(): string;
  clearCache(): void;
  dispose(): void;
}

export interface CreateSkillRunGatewayClientOptions {
  transport?: AuthorizedBackendTransport;
  hasConsumerLock?: boolean;
  hasApprovalDecisionBundle?: boolean;
  getAuthScopeKey?: () => string;
}

export function createSkillRunGatewayClient(
  options: CreateSkillRunGatewayClientOptions = {},
): SkillRunGatewayClient {
  const transport = options.transport ?? createAuthorizedBackendTransport();
  const lockGate = options.hasConsumerLock ?? hasSkillRunConsumerLock();
  const decisionBundleGate =
    options.hasApprovalDecisionBundle ?? hasSkillRunApprovalDecisionBundle();
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
  /** Per-provider-run route hints derived from Bundle `/api/v1/runs/{run_id}/*` only. */
  const routesByRunId = new Map<
    string,
    {
      kind: "skill-run";
      eventPath: string;
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

  function resolveRoutes(runId: string) {
    return routesByRunId.get(runId) ?? defaultSkillRunRoutes(runId);
  }

  function normalizeArtifactList(body: unknown): SkillRunArtifactDescriptor[] {
    return mapPublicArtifactList(body);
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

      // v1.2.1 accepted identity is structuredContent.run_id only
      // (see contracts/skill-run/v1.2.1/fixtures/tools-call-accepted.json).
      // Hermes Task task_id / hermes URLs are not Skill Run SoT.
      const data = isRecord(result) ? result : {};
      const structured = isRecord(data.structuredContent)
        ? data.structuredContent
        : null;

      const runId =
        (structured && typeof structured.run_id === "string" && structured.run_id.trim()) ||
        "";

      if (!runId) {
        throw new SkillRunGatewayError(
          "Invalid backend response: missing structuredContent.run_id",
          502,
          "SKILL_UNSUPPORTED_SCHEMA",
        );
      }

      const defaults = defaultSkillRunRoutes(runId);
      const routes = structured
        ? {
            ...defaults,
            eventPath: toApiPath(
              structured.event_stream ?? structured.event_stream_url,
              defaults.eventPath,
            ),
            resultPath: toApiPath(structured.result_url, defaults.resultPath),
            artifactPath: toApiPath(structured.artifact_url, defaults.artifactPath),
          }
        : defaults;

      // Reject Hermes Task URL overrides even when run_id is present.
      if (
        routes.eventPath.includes("hermes/tasks/") ||
        routes.resultPath.includes("hermes/tasks/") ||
        routes.artifactPath.includes("hermes/tasks/")
      ) {
        throw new SkillRunGatewayError(
          "Invalid backend response: Hermes Task URLs are not Skill Run transport",
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
          : body
        : {};

      const status =
        (typeof data.status === "string" && data.status) ||
        "running";

      return {
        runId:
          (typeof data.id === "string" && data.id) ||
          (typeof data.run_id === "string" && data.run_id) ||
          runId,
        status,
        resultText: extractResultText(data),
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
      const headers: Record<string, string> = {
        Accept: "text/event-stream",
      };
      if (options.lastEventId) {
        headers["Last-Event-ID"] = options.lastEventId;
      }

      return transport.authorizedFetch(routes.eventPath, {
        method: "GET",
        headers,
        signal: options.signal,
      });
    },

    hasConsumerLock(): boolean {
      return lockGate;
    },

    hasApprovalDecisionBundle(): boolean {
      return decisionBundleGate;
    },

    async decideApproval(input: {
      runId: string;
      approvalId: string;
      decision: "allow" | "deny";
      idempotencyKey: string;
    }): Promise<SkillRunApprovalDecisionReceipt> {
      assertNotDisposed();
      if (!decisionBundleGate) {
        throw new SkillRunGatewayError(
          "Skill Run approval decision contract is not available.",
          400,
          "APPROVAL_DECISION_UNSUPPORTED",
        );
      }
      if (input.decision !== "allow" && input.decision !== "deny") {
        throw new SkillRunGatewayError(
          "Invalid approval decision",
          400,
          "INVALID_DECISION",
        );
      }
      if (!input.idempotencyKey.trim()) {
        throw new SkillRunGatewayError(
          "X-Idempotency-Key is required",
          400,
          "IDEMPOTENCY_KEY_REQUIRED",
        );
      }

      const encRun = encodeURIComponent(input.runId);
      const encApproval = encodeURIComponent(input.approvalId);
      const path = `/api/v1/runs/${encRun}/approvals/${encApproval}/decision`;
      const res = await transport.authorizedFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        idempotencyKey: input.idempotencyKey,
        body: JSON.stringify({ decision: input.decision }),
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
          `Approval decision failed with status ${res.status}`;
        const errorCode =
          typeof errBody.error_code === "string"
            ? errBody.error_code
            : res.status === 409
              ? "IDEMPOTENCY_CONFLICT"
              : "APPROVAL_DECISION_FAILED";
        throw new SkillRunGatewayError(message, res.status, errorCode);
      }

      const data = isRecord(body) ? body : {};
      const runId =
        typeof data.run_id === "string" && data.run_id.trim() ? data.run_id.trim() : "";
      const approvalId =
        typeof data.approval_id === "string" && data.approval_id.trim()
          ? data.approval_id.trim()
          : "";
      const decision =
        data.decision === "allow" || data.decision === "deny" ? data.decision : "";
      const status =
        typeof data.status === "string" && data.status.trim() ? data.status.trim() : "";
      const decidedAt =
        typeof data.decided_at === "string" && data.decided_at.trim()
          ? data.decided_at.trim()
          : "";
      if (!runId || !approvalId || !decision || !status || !decidedAt) {
        throw new SkillRunGatewayError(
          "Invalid backend response: missing approval decision receipt fields",
          502,
          "SKILL_UNSUPPORTED_SCHEMA",
        );
      }
      return {
        runId,
        approvalId,
        decision,
        status,
        decidedAt,
      };
    },

    getAuthScopeKey(): string {
      return resolveAuthScopeKey();
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
