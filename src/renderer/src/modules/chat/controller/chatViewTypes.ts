/** Canonical chat view model for Renderer Controller (v8.0.2). */

import type {
  ApprovalRequest,
  ChatUsage,
  ClarifyRequest,
} from "@shared/chat-runtime/chat-runtime-events";
import type { Attachment } from "@shared/attachments";

export type ChatRunState =
  | "idle"
  | "creating"
  | "streaming"
  | "waiting_approval"
  | "waiting_clarify"
  | "completed"
  | "failed"
  | "cancelled";

export type ChatAttachment = Attachment;

export type ChatViewItem =
  | {
      id: string;
      kind: "user";
      content: string;
      timestamp?: number;
      pending?: boolean;
      attachments?: ChatAttachment[];
    }
  | {
      id: string;
      kind: "assistant";
      content: string;
      timestamp?: number;
      pending?: boolean;
      attachments?: ChatAttachment[];
      error?: string;
      isSlashLoader?: boolean;
    }
  | {
      id: string;
      kind: "reasoning";
      content: string;
      pending?: boolean;
    }
  | {
      id: string;
      kind: "tool_call";
      callId: string;
      name: string;
      args: string;
      status: "running" | "completed" | "failed";
    }
  | {
      id: string;
      kind: "tool_result";
      callId: string;
      name: string;
      content: string;
      attachments?: ChatAttachment[];
    }
  | {
      id: string;
      kind: "clarify";
      request: ClarifyRequest;
      answer?: string;
      resolved?: boolean;
      interactionStatus?: ChatPendingInteractionStatus;
      interactionError?: string;
    }
  | {
      id: string;
      kind: "approval";
      request: ApprovalRequest;
      resolved?: boolean;
      decision?: "approved" | "denied";
      denyReason?: string;
      interactionStatus?: ChatPendingInteractionStatus;
      interactionError?: string;
    }
  | {
      id: string;
      kind: "error";
      content: string;
      code?: string;
      /** Links error row to the turn snapshot for Retry. */
      turnId?: string;
    };

export type ChatPendingInteractionStatus =
  | "waiting"
  | "submitting"
  | "resolved"
  | "failed";

export type ChatPendingInteractionState = {
  requestId: string;
  turnId: string;
  type: "clarify" | "approval";
  status: ChatPendingInteractionStatus;
  error?: string;
};

export type ChatAttachmentState = {
  id: string;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  path?: string;
  kind?: Attachment["kind"];
  dataUrl?: string;
  text?: string;
  mime?: string;
  size?: number;
};

export type ChatControllerState = {
  activeSessionId: string | null;
  activeRunId: string;
  /** Isolates concurrent turns within the same run (v8.0.4). */
  activeTurnId: string | null;
  messages: ChatViewItem[];
  streamingMessageId: string | null;
  toolProgress: string | null;
  usage: ChatUsage | null;
  /** Cumulative usage across turns in this run (tooltip). */
  cumulativeUsage: ChatUsage | null;
  attachments: ChatAttachmentState[];
  selectedModelId: string | null;
  runState: ChatRunState;
  lastError: string | null;
  /** Monotonic seq for correlating late events with the current run generation. */
  runGeneration: number;
  pendingInteraction: ChatPendingInteractionState | null;
};
