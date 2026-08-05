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
  /** Isolates concurrent turns within the same run (v8.0.4). */
  turnId: string;
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
  /** Permission prompt mode — distinct from workMode (ask/plan/craft). */
  permissionMode?: "default" | "ask_each_time";
  invocationSource: ChatInvocationSource;
};

export type ChatSubmitResult =
  | {
      ok: true;
      runId: string;
      turnId: string;
      response: string;
      sessionId?: string;
    }
  | {
      ok: false;
      runId: string;
      turnId: string;
      errorCode?: string;
      error: string;
    };

export type ChatAbortInput = {
  runId: string;
};

export type ChatRuntimeCommand =
  | {
      type: "clarify.respond";
      runId: string;
      requestId: string;
      answer: string;
    }
  | {
      type: "approval.approve";
      runId: string;
      requestId: string;
    }
  | {
      type: "approval.deny";
      runId: string;
      requestId: string;
      reason?: string;
    };

export type ChatRuntimeCommandResult =
  | { ok: true }
  | { ok: false; error: string };

export const CHAT_RUNTIME_CHANNELS = {
  submit: "chat-runtime:submit",
  abort: "chat-runtime:abort",
  event: "chat-runtime:event",
  reconcile: "chat-runtime:reconcile-session",
  command: "chat-runtime:command",
} as const;
