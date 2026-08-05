import { ipcRenderer } from "electron";
import type {
  ChatAbortInput,
  ChatSubmitInput,
  ChatSubmitResult,
} from "../shared/chat-runtime/chat-runtime-contract";
import { CHAT_RUNTIME_CHANNELS } from "../shared/chat-runtime/chat-runtime-contract";
import type { ChatRuntimeEvent } from "../shared/chat-runtime/chat-runtime-events";
import { isChatRuntimeEvent } from "../shared/chat-runtime/chat-runtime-events";

export const chatRuntimeApi = {
  submit(input: ChatSubmitInput): Promise<ChatSubmitResult> {
    return ipcRenderer.invoke(CHAT_RUNTIME_CHANNELS.submit, input);
  },

  abort(input: ChatAbortInput | string): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(CHAT_RUNTIME_CHANNELS.abort, input);
  },

  command(
    input: import("../shared/chat-runtime/chat-runtime-contract").ChatRuntimeCommand,
  ): Promise<
    import("../shared/chat-runtime/chat-runtime-contract").ChatRuntimeCommandResult
  > {
    return ipcRenderer.invoke(CHAT_RUNTIME_CHANNELS.command, input);
  },

  onEvent(callback: (event: ChatRuntimeEvent) => void): () => void {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: unknown,
    ): void => {
      if (isChatRuntimeEvent(payload)) {
        callback(payload);
      }
    };
    ipcRenderer.on(CHAT_RUNTIME_CHANNELS.event, listener);
    return () => ipcRenderer.removeListener(CHAT_RUNTIME_CHANNELS.event, listener);
  },
};

export type ChatRuntimeAPI = typeof chatRuntimeApi;
