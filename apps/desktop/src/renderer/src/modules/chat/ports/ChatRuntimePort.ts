import type {
  ChatSubmitInput,
  ChatSubmitResult,
  ChatStartInput,
  ChatStartResult,
  ChatRuntimeCommand,
  ChatRuntimeCommandResult,
} from "@shared/chat-runtime/chat-runtime-contract";
import type { ChatRuntimeEvent } from "@shared/chat-runtime/chat-runtime-events";
import type {
  ChatRuntimeGetStateInput,
  ChatRuntimeGetStateResult,
  ChatRuntimeRecoverInput,
  ChatRuntimeRecoverResult,
  ChatRuntimeGetSnapshotInput,
  ChatRuntimeGetSnapshotResult,
  ChatRuntimeReplayEventsInput,
  ChatRuntimeReplayEventsResult,
  DurableChatQueueEntry,
} from "@shared/chat-runtime/chat-runtime-state";
import type { ChatDiagnosticsExport } from "@shared/chat-runtime/chat-runtime-trace";

/** Port abstracting chat start / abort / streaming events. */
export interface ChatRuntimePort {
  /** v8.1 — event-driven start (returns immediately). */
  start?(input: ChatStartInput): Promise<ChatStartResult>;
  /** @deprecated Prefer start + onEvent. */
  submit(input: ChatSubmitInput): Promise<ChatSubmitResult>;
  abort(runId: string): Promise<{ ok: boolean }>;
  command?(input: ChatRuntimeCommand): Promise<ChatRuntimeCommandResult>;
  getState?(input: ChatRuntimeGetStateInput): Promise<ChatRuntimeGetStateResult>;
  recover?(input?: ChatRuntimeRecoverInput): Promise<ChatRuntimeRecoverResult>;
  getSnapshot?(
    input: ChatRuntimeGetSnapshotInput,
  ): Promise<ChatRuntimeGetSnapshotResult>;
  replayEvents?(
    input: ChatRuntimeReplayEventsInput,
  ): Promise<ChatRuntimeReplayEventsResult>;
  exportDiagnostics?(input: {
    runId: string;
  }): Promise<ChatDiagnosticsExport | { ok: false; error: string }>;
  saveDiagnostics?(input: {
    runId: string;
  }): Promise<
    { ok: true; path: string } | { ok: false; error: string; cancelled?: boolean }
  >;
  queue?: {
    enqueue(input: {
      runId: string;
      profileId?: string;
      snapshotJson: string;
      position?: number;
    }): Promise<{ ok: true; entry: DurableChatQueueEntry }>;
    list(input: {
      runId: string;
      profileId?: string;
    }): Promise<{
      ok: true;
      entries: DurableChatQueueEntry[];
      autoDrain: boolean;
    }>;
    remove(input: {
      queueId: string;
      runId: string;
      profileId?: string;
    }): Promise<{ ok: true }>;
    move(input: {
      runId: string;
      profileId?: string;
      queueId: string;
      toPosition: number;
    }): Promise<{ ok: true; entries: DurableChatQueueEntry[] }>;
    markRunning(input: {
      queueId: string;
      runId: string;
      profileId?: string;
    }): Promise<{ ok: true }>;
    complete(input: {
      queueId: string;
      runId: string;
      profileId?: string;
      status?: "completed" | "failed" | "cancelled";
    }): Promise<{ ok: true }>;
    setAutoDrain(input: {
      runId: string;
      enabled: boolean;
    }): Promise<{ ok: true; autoDrain: boolean }>;
  };
  onEvent(callback: (event: ChatRuntimeEvent) => void): () => void;
}
