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
  exportDiagnostics?(input: {
    runId: string;
  }): Promise<ChatDiagnosticsExport | { ok: false; error: string }>;
  onEvent(callback: (event: ChatRuntimeEvent) => void): () => void;
}
