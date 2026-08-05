import type { ChatRuntimePort } from "../../ports/ChatRuntimePort";
import type {
  ChatSubmitInput,
  ChatSubmitResult,
  ChatRuntimeCommand,
  ChatRuntimeCommandResult,
} from "@shared/chat-runtime/chat-runtime-contract";
import type { ChatRuntimeEvent } from "@shared/chat-runtime/chat-runtime-events";

/** AI-OS adapter: window.chatRuntime → ChatRuntimePort */
export const aiosChatRuntimeAdapter: ChatRuntimePort = {
  submit(input: ChatSubmitInput): Promise<ChatSubmitResult> {
    return window.chatRuntime.submit(input);
  },
  abort(runId: string): Promise<{ ok: boolean }> {
    return window.chatRuntime.abort(runId);
  },
  command(input: ChatRuntimeCommand): Promise<ChatRuntimeCommandResult> {
    return window.chatRuntime.command(input);
  },
  onEvent(callback: (event: ChatRuntimeEvent) => void): () => void {
    return window.chatRuntime.onEvent(callback);
  },
};
