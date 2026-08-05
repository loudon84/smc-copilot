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
    }
  | {
      id: string;
      kind: "approval";
      request: ApprovalRequest;
    }
  | {
      id: string;
      kind: "error";
      content: string;
      code?: string;
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
  messages: ChatViewItem[];
  streamingMessageId: string | null;
  toolProgress: string | null;
  usage: ChatUsage | null;
  attachments: ChatAttachmentState[];
  selectedModelId: string | null;
  runState: ChatRunState;
  lastError: string | null;
  /** Monotonic seq for correlating late events with the current run generation. */
  runGeneration: number;
};
