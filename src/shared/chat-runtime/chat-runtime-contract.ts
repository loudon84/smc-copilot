/** v8.0 Chat Runtime — shared submit / model / attachment / command contracts. */

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

/** v8.0.5 — commands are turn-scoped. */
export type ChatRuntimeCommandBase = {
  runId: string;
  turnId: string;
  requestId: string;
  sessionId?: string;
};

export type ChatRuntimeCommand =
  | (ChatRuntimeCommandBase & {
      type: "clarify.respond";
      answer: string;
    })
  | (ChatRuntimeCommandBase & {
      type: "approval.approve";
    })
  | (ChatRuntimeCommandBase & {
      type: "approval.deny";
      reason?: string;
    });

/**
 * Controller / UI draft — runId filled by host; turnId defaults to active turn.
 * Do not use `Omit<ChatRuntimeCommand, …>` (union Omit collapses payload fields).
 */
export type ChatRuntimeCommandDraft =
  | {
      type: "clarify.respond";
      requestId: string;
      answer: string;
      turnId?: string;
      sessionId?: string;
    }
  | {
      type: "approval.approve";
      requestId: string;
      turnId?: string;
      sessionId?: string;
    }
  | {
      type: "approval.deny";
      requestId: string;
      reason?: string;
      turnId?: string;
      sessionId?: string;
    };

export type ChatRuntimeCommandErrorCode =
  | "RUN_NOT_FOUND"
  | "TURN_MISMATCH"
  | "REQUEST_NOT_FOUND"
  | "REQUEST_ALREADY_RESOLVED"
  | "INVALID_STATE"
  | "GATEWAY_UNSUPPORTED"
  | "COMMAND_FAILED"
  | "INVALID_INPUT";

export type ChatRuntimeCommandResult =
  | {
      ok: true;
      runId: string;
      turnId: string;
      requestId: string;
      acceptedAt: number;
    }
  | {
      ok: false;
      code: ChatRuntimeCommandErrorCode;
      error: string;
    };

export const CHAT_RUNTIME_CHANNELS = {
  submit: "chat-runtime:submit",
  abort: "chat-runtime:abort",
  event: "chat-runtime:event",
  reconcile: "chat-runtime:reconcile-session",
  command: "chat-runtime:command",
} as const;
