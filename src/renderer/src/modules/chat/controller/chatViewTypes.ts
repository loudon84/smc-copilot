/** Canonical chat view model for Renderer Controller (v8.0.1). */

import type {
  ApprovalRequest,
  ChatToolEvent,
  ChatUsage,
  ClarifyRequest,
} from "@shared/chat-runtime/chat-runtime-events";

export type ChatRunState =
  | "idle"
  | "creating"
  | "streaming"
  | "waiting_approval"
  | "waiting_clarify"
  | "completed"
  | "failed"
  | "cancelled";

export type ChatViewItem =
  | {
      id: string;
      kind: "user";
      content: string;
      timestamp?: number;
      pending?: boolean;
    }
  | {
      id: string;
      kind: "assistant";
      content: string;
      timestamp?: number;
      pending?: boolean;
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
      event: ChatToolEvent;
    }
  | {
      id: string;
      kind: "tool_result";
      event: ChatToolEvent;
    }
  | {
      id: string;
      kind: "clarify";
      request: ClarifyRequest;
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
