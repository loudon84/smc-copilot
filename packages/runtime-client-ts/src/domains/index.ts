import type { RuntimeTransport } from "../transport/types";

function enc(id: string): string {
  return encodeURIComponent(id);
}

export function createSessionDomain(transport: RuntimeTransport) {
  return {
    listByInstance: (instanceId: string, signal?: AbortSignal) =>
      transport.request({ path: `/api/v1/instances/${enc(instanceId)}/sessions`, signal }),
    catalog: (query?: Record<string, string | number | undefined>, signal?: AbortSignal) =>
      transport.request({ path: "/api/v1/session-catalog", query, signal }),
  };
}

export function createConfigurationDomain(transport: RuntimeTransport) {
  return {
    getModelConfig: (instanceId: string, signal?: AbortSignal) =>
      transport.request({
        path: `/api/v1/instances/${enc(instanceId)}/configuration/model`,
        signal,
      }),
    setModelConfig: (instanceId: string, body: unknown, signal?: AbortSignal) =>
      transport.request({
        method: "PUT",
        path: `/api/v1/instances/${enc(instanceId)}/configuration/model`,
        body,
        signal,
      }),
  };
}

export function createSecretDomain(transport: RuntimeTransport) {
  return {
    list: (scope: string, signal?: AbortSignal) =>
      transport.request({ path: `/api/v1/secrets/${enc(scope)}`, signal }),
    put: (scope: string, body: unknown, signal?: AbortSignal) =>
      transport.request({ method: "PUT", path: `/api/v1/secrets/${enc(scope)}`, body, signal }),
    delete: (scope: string, key: string, signal?: AbortSignal) =>
      transport.request({
        method: "DELETE",
        path: `/api/v1/secrets/${enc(scope)}/${enc(key)}`,
        signal,
      }),
  };
}

export function createAttachmentDomain(transport: RuntimeTransport) {
  return {
    upload: (body: unknown, signal?: AbortSignal) =>
      transport.request({ method: "POST", path: "/api/v1/attachments", body, signal }),
    get: (attachmentId: string, signal?: AbortSignal) =>
      transport.request({ path: `/api/v1/attachments/${enc(attachmentId)}`, signal }),
    delete: (attachmentId: string, signal?: AbortSignal) =>
      transport.request({
        method: "DELETE",
        path: `/api/v1/attachments/${enc(attachmentId)}`,
        signal,
      }),
  };
}

export function createApprovalDomain(transport: RuntimeTransport) {
  return {
    listPending: (signal?: AbortSignal) =>
      transport.request({ path: "/api/v1/approvals", query: { status: "pending" }, signal }),
    approve: (approvalId: string, body?: unknown, signal?: AbortSignal) =>
      transport.request({
        method: "POST",
        path: `/api/v1/approvals/${enc(approvalId)}/approve`,
        body: body ?? {},
        signal,
      }),
    reject: (approvalId: string, body?: unknown, signal?: AbortSignal) =>
      transport.request({
        method: "POST",
        path: `/api/v1/approvals/${enc(approvalId)}/reject`,
        body: body ?? {},
        signal,
      }),
  };
}

export {
  createWorkTaskDomain,
  createTaskDomain,
  type WorkTaskDomain,
  type TaskDomain,
  type WorkTaskCreate,
  type WorkTaskPatch,
  type WorkTaskResponse,
  type WorkTaskListResponse,
  type WorkTaskAssignBody,
  type WorkTaskListQuery,
  type WorkTaskEventsQuery,
  type WorkTaskSnapshot,
  type TaskRunResponse,
  type TaskStartResult,
  type TaskEventResponse,
} from "./work-task";

export function createResourceDomain(transport: RuntimeTransport) {
  return {
    list: (instanceId: string, signal?: AbortSignal) =>
      transport.request({ path: `/api/v1/instances/${enc(instanceId)}/resources`, signal }),
    apply: (instanceId: string, body: unknown, signal?: AbortSignal) =>
      transport.request({
        method: "POST",
        path: `/api/v1/instances/${enc(instanceId)}/resources/apply`,
        body,
        signal,
      }),
  };
}

export function createDiagnosticsDomain(transport: RuntimeTransport) {
  return {
    summary: (signal?: AbortSignal) =>
      transport.request({ path: "/api/v1/diagnostics/summary", signal }),
    createBundle: (body?: unknown, signal?: AbortSignal) =>
      transport.request({
        method: "POST",
        path: "/api/v1/diagnostics/bundles",
        body: body ?? {},
        signal,
      }),
  };
}

export function createEndpointDomain(transport: RuntimeTransport) {
  return {
    enroll: (body: unknown, signal?: AbortSignal) =>
      transport.request({ method: "POST", path: "/api/v1/endpoint/enroll", body, signal }),
    inventory: (signal?: AbortSignal) =>
      transport.request({ path: "/api/v1/endpoint/inventory", signal }),
  };
}

export function createMcpDomain(transport: RuntimeTransport) {
  return {
    list: (instanceId: string, signal?: AbortSignal) =>
      transport.request({ path: `/api/v1/instances/${enc(instanceId)}/mcp/servers`, signal }),
    upsert: (instanceId: string, body: unknown, signal?: AbortSignal) =>
      transport.request({
        method: "PUT",
        path: `/api/v1/instances/${enc(instanceId)}/mcp/servers`,
        body,
        signal,
      }),
    test: (instanceId: string, serverId: string, signal?: AbortSignal) =>
      transport.request({
        method: "POST",
        path: `/api/v1/instances/${enc(instanceId)}/mcp/servers/${enc(serverId)}/test`,
        body: {},
        signal,
      }),
    remove: (instanceId: string, serverId: string, signal?: AbortSignal) =>
      transport.request({
        method: "DELETE",
        path: `/api/v1/instances/${enc(instanceId)}/mcp/servers/${enc(serverId)}`,
        signal,
      }),
  };
}

export {
  createChatDomain,
  type ChatDomain,
  type ChatCreateRunBody,
  type ChatCreateTurnBody,
  type ChatAcceptedResult,
  type ChatRunResponse,
  type ChatSnapshotResponse,
  type ChatEventResponse,
  type ChatAbortResponse,
  type ChatInteractionResponse,
  type ChatQueueEntryResponse,
  type ChatQueueCreateBody,
  type ChatQueuePatchBody,
  type ChatClarifyRespondBody,
  type ChatApprovalRespondBody,
  type ChatInteractionRespondBody,
} from "./chat";
