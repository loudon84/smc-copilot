import type { ChatRuntimePort } from "../../ports/ChatRuntimePort";
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
} from "@shared/chat-runtime/chat-runtime-state";
import type { ChatDiagnosticsExport } from "@shared/chat-runtime/chat-runtime-trace";
import { ensureRuntimeReadyForWrite } from "../../../../lib/runtime/runtimeWriteGate";

/** AI-OS adapter: window.chatRuntime → ChatRuntimePort */
export const aiosChatRuntimeAdapter: ChatRuntimePort = {
  async start(input: ChatStartInput): Promise<ChatStartResult> {
    await ensureRuntimeReadyForWrite();
    return window.chatRuntime.start(input);
  },
  async submit(input: ChatSubmitInput): Promise<ChatSubmitResult> {
    await ensureRuntimeReadyForWrite();
    return window.chatRuntime.submit(input);
  },
  abort(runId: string): Promise<{ ok: boolean }> {
    return window.chatRuntime.abort(runId);
  },
  command(input: ChatRuntimeCommand): Promise<ChatRuntimeCommandResult> {
    return window.chatRuntime.command(input);
  },
  getState(input: ChatRuntimeGetStateInput): Promise<ChatRuntimeGetStateResult> {
    return window.chatRuntime.getState(input);
  },
  recover(input?: ChatRuntimeRecoverInput): Promise<ChatRuntimeRecoverResult> {
    return window.chatRuntime.recover(input);
  },
  getSnapshot(
    input: ChatRuntimeGetSnapshotInput,
  ): Promise<ChatRuntimeGetSnapshotResult> {
    return window.chatRuntime.getSnapshot(input);
  },
  replayEvents(
    input: ChatRuntimeReplayEventsInput,
  ): Promise<ChatRuntimeReplayEventsResult> {
    return window.chatRuntime.replayEvents(input);
  },
  exportDiagnostics(input: {
    runId: string;
  }): Promise<ChatDiagnosticsExport | { ok: false; error: string }> {
    return window.chatRuntime.exportDiagnostics(input);
  },
  saveDiagnostics(input: { runId: string }) {
    return window.chatRuntime.saveDiagnostics(input);
  },
  queue: window.chatRuntime.queue,
  onEvent(callback: (event: ChatRuntimeEvent) => void): () => void {
    return window.chatRuntime.onEvent(callback);
  },
};
