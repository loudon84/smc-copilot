import type {
  ChatSubmitInput,
  ChatSubmitResult,
} from "@shared/chat-runtime/chat-runtime-contract";
import type { ChatRuntimeEvent } from "@shared/chat-runtime/chat-runtime-events";

/** Port abstracting chat submit / abort / streaming events. */
export interface ChatRuntimePort {
  submit(input: ChatSubmitInput): Promise<ChatSubmitResult>;
  abort(runId: string): Promise<{ ok: boolean }>;
  onEvent(callback: (event: ChatRuntimeEvent) => void): () => void;
}
