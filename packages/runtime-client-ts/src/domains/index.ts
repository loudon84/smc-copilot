import type { RuntimeTransport } from "../transport/types";

function enc(id: string): string {
  return encodeURIComponent(id);
}

export function createSessionDomain(transport: RuntimeTransport) {
  return {
    listByInstance: (instanceId: string, signal?: AbortSignal) =>
      transport.request({ path: `/api/v1/instances/${enc(instanceId)}/sessions`, signal }),
    search: (instanceId: string, q: string, signal?: AbortSignal) =>
      transport.request({
        path: `/api/v1/instances/${enc(instanceId)}/sessions/search`,
        query: { q },
        signal,
      }),
    stats: (instanceId: string, signal?: AbortSignal) =>
      transport.request<{ totalSessions: number; totalMessages: number }>({
        path: `/api/v1/instances/${enc(instanceId)}/sessions/stats`,
        signal,
      }),
    get: (instanceId: string, sessionId: string, signal?: AbortSignal) =>
      transport.request({
        path: `/api/v1/instances/${enc(instanceId)}/sessions/${enc(sessionId)}`,
        signal,
      }),
    listMessages: (instanceId: string, sessionId: string, signal?: AbortSignal) =>
      transport.request({
        path: `/api/v1/instances/${enc(instanceId)}/sessions/${enc(sessionId)}/messages`,
        signal,
      }),
    delete: (instanceId: string, sessionId: string, signal?: AbortSignal) =>
      transport.request({
        method: "DELETE",
        path: `/api/v1/instances/${enc(instanceId)}/sessions/${enc(sessionId)}`,
        signal,
      }),
    catalog: (query?: Record<string, string | number | undefined>, signal?: AbortSignal) =>
      transport.request({ path: "/api/v1/session-catalog", query, signal }),
    // PRD v1.6 — Session Files
    listFiles: (instanceId: string, sessionId: string, signal?: AbortSignal) =>
      transport.request({
        path: `/api/v1/instances/${enc(instanceId)}/sessions/${enc(sessionId)}/files`,
        signal,
      }),
    searchFiles: (instanceId: string, sessionId: string, q: string, signal?: AbortSignal) =>
      transport.request({
        path: `/api/v1/instances/${enc(instanceId)}/sessions/${enc(sessionId)}/files/search`,
        query: { q },
        signal,
      }),
    addFileContext: (instanceId: string, sessionId: string, fileId: string, signal?: AbortSignal) =>
      transport.request({
        method: "POST",
        path: `/api/v1/instances/${enc(instanceId)}/sessions/${enc(sessionId)}/files/${enc(fileId)}/context`,
        body: {},
        signal,
      }),
    removeFileContext: (
      instanceId: string,
      sessionId: string,
      fileId: string,
      signal?: AbortSignal,
    ) =>
      transport.request({
        method: "DELETE",
        path: `/api/v1/instances/${enc(instanceId)}/sessions/${enc(sessionId)}/files/${enc(fileId)}/context`,
        signal,
      }),
    // PRD v1.6 — Chat Settings (model + contextFolder)
    getChatSettings: (instanceId: string, sessionId: string, signal?: AbortSignal) =>
      transport.request({
        path: `/api/v1/instances/${enc(instanceId)}/sessions/${enc(sessionId)}/chat-settings`,
        signal,
      }),
    patchChatSettings: (
      instanceId: string,
      sessionId: string,
      body: { modelId?: string | null; contextFolder?: string | null },
      signal?: AbortSignal,
    ) =>
      transport.request({
        method: "PATCH",
        path: `/api/v1/instances/${enc(instanceId)}/sessions/${enc(sessionId)}/chat-settings`,
        body,
        signal,
      }),
    // PRD v1.6 — Workspace / Worktree
    listWorkspace: (
      instanceId: string,
      sessionId: string,
      path?: string,
      signal?: AbortSignal,
    ) =>
      transport.request({
        path: `/api/v1/instances/${enc(instanceId)}/sessions/${enc(sessionId)}/workspace`,
        query: path ? { path } : undefined,
        signal,
      }),
    readWorkspaceFile: (
      instanceId: string,
      sessionId: string,
      path: string,
      signal?: AbortSignal,
    ) =>
      transport.request({
        path: `/api/v1/instances/${enc(instanceId)}/sessions/${enc(sessionId)}/workspace/file`,
        query: { path },
        signal,
      }),
    workspaceTerminalPath: (instanceId: string, sessionId: string, signal?: AbortSignal) =>
      transport.request({
        path: `/api/v1/instances/${enc(instanceId)}/sessions/${enc(sessionId)}/workspace/terminal-path`,
        signal,
      }),
    // PRD v1.6 FR-01 — Agent command catalog
    listChatCommands: (instanceId: string, signal?: AbortSignal) =>
      transport.request({
        path: `/api/v1/instances/${enc(instanceId)}/chat/commands`,
        signal,
      }),
  };
}

export function createMemoryDomain(transport: RuntimeTransport) {
  return {
    get: (instanceId: string, signal?: AbortSignal) =>
      transport.request({ path: `/api/v1/instances/${enc(instanceId)}/memory`, signal }),
    addEntry: (instanceId: string, content: string, signal?: AbortSignal) =>
      transport.request({
        method: "POST",
        path: `/api/v1/instances/${enc(instanceId)}/memory/entries`,
        body: { content },
        signal,
      }),
    updateEntry: (instanceId: string, index: number, content: string, signal?: AbortSignal) =>
      transport.request({
        method: "PATCH",
        path: `/api/v1/instances/${enc(instanceId)}/memory/entries/${index}`,
        body: { content },
        signal,
      }),
    deleteEntry: (instanceId: string, index: number, signal?: AbortSignal) =>
      transport.request({
        method: "DELETE",
        path: `/api/v1/instances/${enc(instanceId)}/memory/entries/${index}`,
        signal,
      }),
    putContent: (instanceId: string, content: string, signal?: AbortSignal) =>
      transport.request({
        method: "PUT",
        path: `/api/v1/instances/${enc(instanceId)}/memory/content`,
        body: { content },
        signal,
      }),
    putUserProfile: (instanceId: string, content: string, signal?: AbortSignal) =>
      transport.request({
        method: "PUT",
        path: `/api/v1/instances/${enc(instanceId)}/user-profile`,
        body: { content },
        signal,
      }),
  };
}

export function createExpertMcpDomain(transport: RuntimeTransport) {
  return {
    status: (signal?: AbortSignal) =>
      transport.request({ path: "/api/v1/expert-mcp/status", signal }),
    getConfig: (signal?: AbortSignal) =>
      transport.request({ path: "/api/v1/expert-mcp/config", signal }),
    patchConfig: (body: Record<string, unknown>, signal?: AbortSignal) =>
      transport.request({
        method: "PATCH",
        path: "/api/v1/expert-mcp/config",
        body,
        signal,
      }),
    connect: (signal?: AbortSignal) =>
      transport.request({ method: "POST", path: "/api/v1/expert-mcp/connect", body: {}, signal }),
    reconnect: (signal?: AbortSignal) =>
      transport.request({ method: "POST", path: "/api/v1/expert-mcp/reconnect", body: {}, signal }),
    test: (signal?: AbortSignal) =>
      transport.request({ method: "POST", path: "/api/v1/expert-mcp/test", body: {}, signal }),
    tools: (refresh = false, signal?: AbortSignal) =>
      transport.request({
        path: "/api/v1/expert-mcp/tools",
        query: refresh ? { refresh: "true" } : undefined,
        signal,
      }),
    diagnostics: (signal?: AbortSignal) =>
      transport.request({ path: "/api/v1/expert-mcp/diagnostics", signal }),
    logs: (tail = 200, signal?: AbortSignal) =>
      transport.request({ path: "/api/v1/expert-mcp/logs", query: { tail }, signal }),
    enableForInstance: (instanceId: string, signal?: AbortSignal) =>
      transport.request({
        method: "POST",
        path: `/api/v1/instances/${enc(instanceId)}/expert-mcp/enable`,
        body: {},
        signal,
      }),
    disableForInstance: (instanceId: string, signal?: AbortSignal) =>
      transport.request({
        method: "POST",
        path: `/api/v1/instances/${enc(instanceId)}/expert-mcp/disable`,
        body: {},
        signal,
      }),
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
    environment: (signal?: AbortSignal) =>
      transport.request({ path: "/api/v1/diagnostics/environment", signal }),
    logs: (query?: Record<string, string | number | undefined>, signal?: AbortSignal) =>
      transport.request({ path: "/api/v1/diagnostics/logs", query, signal }),
    createBundle: (body?: unknown, signal?: AbortSignal) =>
      transport.request({
        method: "POST",
        path: "/api/v1/diagnostics/bundle",
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
