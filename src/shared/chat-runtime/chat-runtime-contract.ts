/** v8.0 Chat Runtime — shared submit / model / attachment contracts. */

export type ChatInvocationSource =
  | "default_chat"
  | "expert_chat"
  | "team_chat";

export type ChatHistoryMessage = {
  role: string;
  content: string;
};

export type ChatAttachmentRef = {
  id: string;
  name: string;
  mime_type?: string;
  size_bytes?: number;
  storage_path?: string;
  text_preview?: string | null;
};

export type ChatModelOverride = {
  modelId: string;
  model?: string;
  provider?: string;
  baseUrl?: string;
};

export type ChatSubmitInput = {
  runId: string;
  profileId: string;
  sessionId?: string;

  message: string;
  history: ChatHistoryMessage[];
  attachments?: ChatAttachmentRef[];
  contextFolder?: string;
  model?: ChatModelOverride;

  expertId?: string;
  teamId?: string;
  expertRunId?: string;
  workMode?: "ask" | "plan" | "craft" | string;
  invocationSource: ChatInvocationSource;
};

export type ChatSubmitResult =
  | {
      ok: true;
      runId: string;
      response: string;
      sessionId?: string;
    }
  | {
      ok: false;
      runId: string;
      errorCode?: string;
      error: string;
    };

export type ChatAbortInput = {
  runId: string;
};

export const CHAT_RUNTIME_CHANNELS = {
  submit: "chat-runtime:submit",
  abort: "chat-runtime:abort",
  event: "chat-runtime:event",
  reconcile: "chat-runtime:reconcile-session",
} as const;
