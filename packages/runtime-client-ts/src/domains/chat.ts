import type { components } from "../generated/schema";
import type { RuntimeSseMessage, RuntimeTransport } from "../transport/types";

function enc(id: string): string {
  return encodeURIComponent(id);
}

export type ChatCreateRunBody = components["schemas"]["ChatCreateRunBody"];
export type ChatCreateTurnBody = components["schemas"]["ChatCreateTurnBody"];
export type ChatAcceptedResult = components["schemas"]["ChatAcceptedResult"];
export type ChatRunResponse = components["schemas"]["ChatRunResponse"];
export type ChatSnapshotResponse = components["schemas"]["ChatSnapshotResponse"];
export type ChatEventResponse = components["schemas"]["ChatEventResponse"];
export type ChatAbortResponse = components["schemas"]["ChatAbortResponse"];
export type ChatInteractionResponse = components["schemas"]["ChatInteractionResponse"];
export type ChatQueueEntryResponse = components["schemas"]["ChatQueueEntryResponse"];
export type ChatQueueCreateBody = components["schemas"]["ChatQueueCreateBody"];
export type ChatQueuePatchBody = components["schemas"]["ChatQueuePatchBody"];
export type ChatClarifyRespondBody = components["schemas"]["ChatClarifyRespondBody"];
export type ChatApprovalRespondBody = components["schemas"]["ChatApprovalRespondBody"];
export type ChatInteractionRespondBody = ChatClarifyRespondBody | ChatApprovalRespondBody;

export interface ChatDomain {
  createRun(body: ChatCreateRunBody, signal?: AbortSignal): Promise<ChatAcceptedResult>;
  getRun(runId: string, signal?: AbortSignal): Promise<ChatRunResponse>;
  snapshot(runId: string, signal?: AbortSignal): Promise<ChatSnapshotResponse>;
  createTurn(runId: string, body: ChatCreateTurnBody, signal?: AbortSignal): Promise<ChatAcceptedResult>;
  abort(runId: string, body?: Record<string, never>, signal?: AbortSignal): Promise<ChatAbortResponse>;
  listEvents(
    runId: string,
    query?: { after_sequence?: number; limit?: number },
    signal?: AbortSignal,
  ): Promise<ChatEventResponse[]>;
  streamEvents(runId: string, opts?: { lastEventId?: string; signal?: AbortSignal }): AsyncIterable<RuntimeSseMessage>;
  respondInteraction(
    runId: string,
    requestId: string,
    body: ChatInteractionRespondBody,
    signal?: AbortSignal,
  ): Promise<ChatInteractionResponse>;
  listQueue(runId: string, signal?: AbortSignal): Promise<ChatQueueEntryResponse[]>;
  enqueue(runId: string, body: ChatQueueCreateBody, signal?: AbortSignal): Promise<ChatQueueEntryResponse>;
  patchQueue(
    runId: string,
    queueId: string,
    body: ChatQueuePatchBody,
    signal?: AbortSignal,
  ): Promise<ChatQueueEntryResponse>;
  deleteQueue(runId: string, queueId: string, signal?: AbortSignal): Promise<ChatQueueEntryResponse>;
}

export function createChatDomain(transport: RuntimeTransport): ChatDomain {
  return {
    createRun: (body, signal) =>
      transport.request<ChatAcceptedResult>({ method: "POST", path: "/api/v1/chat-runs", body, signal }),
    getRun: (runId, signal) =>
      transport.request<ChatRunResponse>({ path: `/api/v1/chat-runs/${enc(runId)}`, signal }),
    snapshot: (runId, signal) =>
      transport.request<ChatSnapshotResponse>({ path: `/api/v1/chat-runs/${enc(runId)}/snapshot`, signal }),
    createTurn: (runId, body, signal) =>
      transport.request<ChatAcceptedResult>({
        method: "POST",
        path: `/api/v1/chat-runs/${enc(runId)}/turns`,
        body,
        signal,
      }),
    abort: (runId, body, signal) =>
      transport.request<ChatAbortResponse>({
        method: "POST",
        path: `/api/v1/chat-runs/${enc(runId)}/abort`,
        body: body ?? {},
        signal,
      }),
    listEvents: (runId, query, signal) =>
      transport.request<ChatEventResponse[]>({
        path: `/api/v1/chat-runs/${enc(runId)}/events`,
        query,
        signal,
      }),
    streamEvents: (runId, opts) =>
      transport.stream({
        path: `/api/v1/chat-runs/${enc(runId)}/events/stream`,
        lastEventId: opts?.lastEventId,
        signal: opts?.signal,
      }),
    respondInteraction: (runId, requestId, body, signal) =>
      transport.request<ChatInteractionResponse>({
        method: "POST",
        path: `/api/v1/chat-runs/${enc(runId)}/interactions/${enc(requestId)}/respond`,
        body,
        signal,
      }),
    listQueue: (runId, signal) =>
      transport.request<ChatQueueEntryResponse[]>({ path: `/api/v1/chat-runs/${enc(runId)}/queue`, signal }),
    enqueue: (runId, body, signal) =>
      transport.request<ChatQueueEntryResponse>({
        method: "POST",
        path: `/api/v1/chat-runs/${enc(runId)}/queue`,
        body,
        signal,
      }),
    patchQueue: (runId, queueId, body, signal) =>
      transport.request<ChatQueueEntryResponse>({
        method: "PATCH",
        path: `/api/v1/chat-runs/${enc(runId)}/queue/${enc(queueId)}`,
        body,
        signal,
      }),
    deleteQueue: (runId, queueId, signal) =>
      transport.request<ChatQueueEntryResponse>({
        method: "DELETE",
        path: `/api/v1/chat-runs/${enc(runId)}/queue/${enc(queueId)}`,
        signal,
      }),
  };
}
