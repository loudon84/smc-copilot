import type { RuntimeClientAuthOptions } from "./auth-provider";
import { RuntimeApiError } from "./error-normalizer";
import { createDefaultFetchTransport } from "../transport/default-fetch-transport";
import type { RuntimeTransport } from "../transport/types";
import {
  createRuntimeDomain,
  type RuntimeCapabilities,
  type RuntimeReadiness,
  type RuntimeStatus,
} from "../domains/runtime";
import type { RuntimeSseMessage } from "../transport/types";
import { createInstanceDomain } from "../domains/instance";
import {
  createApprovalDomain,
  createAttachmentDomain,
  createChatDomain,
  createConfigurationDomain,
  createDiagnosticsDomain,
  createEndpointDomain,
  createExpertMcpDomain,
  createKanbanDomain,
  createMcpDomain,
  createMemoryDomain,
  createResourceDomain,
  createSecretDomain,
  createSessionDomain,
  createWorkTaskDomain,
} from "../domains/index";

export type { RuntimeStatus, RuntimeCapabilities, RuntimeReadiness };
export type { RuntimeTransport } from "../transport/types";
export type {
  RuntimeRequest,
  RuntimeStreamRequest,
  RuntimeSseMessage,
} from "../transport/types";
export type {
  ChatDomain,
  ChatCreateRunBody,
  ChatCreateTurnBody,
  ChatAcceptedResult,
  ChatRunResponse,
  ChatSnapshotResponse,
  ChatEventResponse,
  ChatAbortResponse,
  ChatInteractionResponse,
  ChatQueueEntryResponse,
  ChatQueueCreateBody,
  ChatQueuePatchBody,
  ChatClarifyRespondBody,
  ChatApprovalRespondBody,
  ChatInteractionRespondBody,
} from "../domains/chat";
export type {
  WorkTaskDomain,
  TaskDomain,
  WorkTaskCreate,
  WorkTaskPatch,
  WorkTaskResponse,
  WorkTaskListResponse,
  WorkTaskAssignBody,
  WorkTaskListQuery,
  WorkTaskEventsQuery,
  WorkTaskSnapshot,
  TaskRunResponse,
  TaskStartResult,
  TaskEventResponse,
} from "../domains/work-task";
export type {
  KanbanDomain,
  KanbanCapabilities,
  KanbanBoard,
  KanbanBoardListResponse,
  CreateKanbanBoardInput,
  KanbanTask,
  KanbanTaskListResponse,
  CreateKanbanTaskInput,
  KanbanTaskDetail,
  KanbanTaskActionInput,
  KanbanComment,
  KanbanCommentCreate,
  KanbanEvent,
  KanbanRun,
  KanbanAssignee,
  KanbanAssigneeListResponse,
  KanbanDispatchRequest,
  KanbanDispatchResult,
  KanbanTaskFilter,
} from "../domains/kanban";

export interface CreateRuntimeClientOptions extends RuntimeClientAuthOptions {
  baseUrl: string;
  desktopVersion?: string;
  runtimeApiVersion?: string;
  fetchImpl?: typeof fetch;
  /** Inject DesktopRuntimeTransport to preserve auth/idempotency/SSE reconnect. */
  transport?: RuntimeTransport;
}

export interface RuntimeClient {
  readonly transport: RuntimeTransport;
  readonly runtime: ReturnType<typeof createRuntimeDomain>;
  readonly instances: ReturnType<typeof createInstanceDomain>;
  readonly sessions: ReturnType<typeof createSessionDomain>;
  readonly memory: ReturnType<typeof createMemoryDomain>;
  readonly expertMcp: ReturnType<typeof createExpertMcpDomain>;
  readonly configuration: ReturnType<typeof createConfigurationDomain>;
  readonly secrets: ReturnType<typeof createSecretDomain>;
  readonly attachments: ReturnType<typeof createAttachmentDomain>;
  readonly approvals: ReturnType<typeof createApprovalDomain>;
  /** Canonical WorkTask domain (alias of workTasks). */
  readonly tasks: ReturnType<typeof createWorkTaskDomain>;
  /** Preferred name for WorkTask domain (PRD v1.3). */
  readonly workTasks: ReturnType<typeof createWorkTaskDomain>;
  readonly resources: ReturnType<typeof createResourceDomain>;
  readonly diagnostics: ReturnType<typeof createDiagnosticsDomain>;
  readonly endpoint: ReturnType<typeof createEndpointDomain>;
  readonly mcp: ReturnType<typeof createMcpDomain>;
  readonly chat: ReturnType<typeof createChatDomain>;
  /** Hermes Kanban facade (PRD v1.7) — independent of WorkTask. */
  readonly kanban: ReturnType<typeof createKanbanDomain>;

  /** @deprecated Prefer client.runtime.getStatus */
  getStatus(signal?: AbortSignal): Promise<RuntimeStatus>;
  /** @deprecated Prefer client.runtime.getCapabilities */
  getCapabilities(signal?: AbortSignal): Promise<RuntimeCapabilities>;
  /** @deprecated Prefer client.runtime.getJobEvents */
  getJobEvents(jobId: string, signal?: AbortSignal): AsyncGenerator<RuntimeSseMessage>;
}

export function createRuntimeClient(options: CreateRuntimeClientOptions): RuntimeClient {
  const transport =
    options.transport ??
    createDefaultFetchTransport({
      baseUrl: options.baseUrl,
      desktopVersion: options.desktopVersion,
      runtimeApiVersion: options.runtimeApiVersion,
      fetchImpl: options.fetchImpl,
      getDeviceToken: options.getDeviceToken,
      getLegacyToken: options.getLegacyToken,
    });

  const runtime = createRuntimeDomain(transport);
  const workTasks = createWorkTaskDomain(transport);
  const client: RuntimeClient = {
    transport,
    runtime,
    instances: createInstanceDomain(transport),
    sessions: createSessionDomain(transport),
    memory: createMemoryDomain(transport),
    expertMcp: createExpertMcpDomain(transport),
    configuration: createConfigurationDomain(transport),
    secrets: createSecretDomain(transport),
    attachments: createAttachmentDomain(transport),
    approvals: createApprovalDomain(transport),
    tasks: workTasks,
    workTasks,
    resources: createResourceDomain(transport),
    diagnostics: createDiagnosticsDomain(transport),
    endpoint: createEndpointDomain(transport),
    mcp: createMcpDomain(transport),
    chat: createChatDomain(transport),
    kanban: createKanbanDomain(transport),
    getStatus: (signal) => runtime.getStatus(signal),
    getCapabilities: (signal) => runtime.getCapabilities(signal),
    async *getJobEvents(jobId, signal) {
      yield* runtime.getJobEvents(jobId, signal);
    },
  };
  return client;
}

export { RuntimeApiError };
