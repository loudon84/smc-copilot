import type { RuntimeClientAuthOptions } from "./auth-provider";
import { RuntimeApiError } from "./error-normalizer";
import { createDefaultFetchTransport } from "../transport/default-fetch-transport";
import type { RuntimeTransport } from "../transport/types";
import { createRuntimeDomain, type RuntimeCapabilities, type RuntimeStatus } from "../domains/runtime";
import { createInstanceDomain } from "../domains/instance";
import {
  createApprovalDomain,
  createAttachmentDomain,
  createChatDomain,
  createConfigurationDomain,
  createDiagnosticsDomain,
  createEndpointDomain,
  createMcpDomain,
  createResourceDomain,
  createSecretDomain,
  createSessionDomain,
  createTaskDomain,
} from "../domains/index";

export type { RuntimeStatus, RuntimeCapabilities };
export type { RuntimeTransport } from "../transport/types";
export type {
  RuntimeRequest,
  RuntimeStreamRequest,
  RuntimeSseMessage,
} from "../transport/types";

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
  readonly configuration: ReturnType<typeof createConfigurationDomain>;
  readonly secrets: ReturnType<typeof createSecretDomain>;
  readonly attachments: ReturnType<typeof createAttachmentDomain>;
  readonly approvals: ReturnType<typeof createApprovalDomain>;
  readonly tasks: ReturnType<typeof createTaskDomain>;
  readonly resources: ReturnType<typeof createResourceDomain>;
  readonly diagnostics: ReturnType<typeof createDiagnosticsDomain>;
  readonly endpoint: ReturnType<typeof createEndpointDomain>;
  readonly mcp: ReturnType<typeof createMcpDomain>;
  readonly chat: ReturnType<typeof createChatDomain>;

  /** @deprecated Prefer client.runtime.getStatus */
  getStatus(signal?: AbortSignal): Promise<RuntimeStatus>;
  /** @deprecated Prefer client.runtime.getCapabilities */
  getCapabilities(signal?: AbortSignal): Promise<RuntimeCapabilities>;
  /** @deprecated Prefer client.runtime.getJobEvents */
  getJobEvents(jobId: string, signal?: AbortSignal): AsyncGenerator<{ data: string; id?: string; event?: string }>;
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
  const client: RuntimeClient = {
    transport,
    runtime,
    instances: createInstanceDomain(transport),
    sessions: createSessionDomain(transport),
    configuration: createConfigurationDomain(transport),
    secrets: createSecretDomain(transport),
    attachments: createAttachmentDomain(transport),
    approvals: createApprovalDomain(transport),
    tasks: createTaskDomain(transport),
    resources: createResourceDomain(transport),
    diagnostics: createDiagnosticsDomain(transport),
    endpoint: createEndpointDomain(transport),
    mcp: createMcpDomain(transport),
    chat: createChatDomain(transport),
    getStatus: (signal) => runtime.getStatus(signal),
    getCapabilities: (signal) => runtime.getCapabilities(signal),
    async *getJobEvents(jobId, signal) {
      yield* runtime.getJobEvents(jobId, signal);
    },
  };
  return client;
}

export { RuntimeApiError };
