/** v8.1 — Durable Chat Runtime state models (run / turn / transport / interaction). */

import type { ChatUsage } from "./chat-runtime-events";

export type ChatTurnStatus =
  | "starting"
  | "streaming"
  | "waiting_clarify"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export type DurableChatRunStatus =
  | "idle"
  | "starting"
  | "streaming"
  | "waiting_clarify"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export type PendingInteractionRecord = {
  requestId: string;
  runId: string;
  turnId: string;
  interactionType: "clarify" | "approval";
  payloadJson: string;
  status: "pending" | "accepted" | "continuing" | "resolved" | "failed";
  createdAt: number;
  resolvedAt?: number;
};

export type DurableChatRunState = {
  runId: string;
  activeTurnId?: string;
  profileId: string;
  sessionId?: string;
  status: DurableChatRunStatus;
  pendingInteractions: PendingInteractionRecord[];
  lastEventSequence: number;
  updatedAt: number;
};

export type ChatTransportHandle = {
  runId: string;
  turnId: string;
  abort(): void;
};

export type ChatQueueEntryStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type DurableChatQueueEntry = {
  queueId: string;
  runId: string;
  position: number;
  snapshotJson: string;
  status: ChatQueueEntryStatus;
  createdAt: number;
};

export type ChatRuntimeGetStateInput = {
  runId: string;
};

export type ChatRuntimeGetStateResult =
  | {
      ok: true;
      run: DurableChatRunState;
      turns: DurableChatTurnSummary[];
      queue: DurableChatQueueEntry[];
      usage?: ChatUsage;
    }
  | {
      ok: false;
      code: string;
      error: string;
    };

export type DurableChatTurnSummary = {
  turnId: string;
  runId: string;
  sessionId?: string;
  profileId: string;
  status: ChatTurnStatus;
  rawText?: string;
  effectiveText?: string;
  requestSnapshotJson?: string;
  startedAt: number;
  completedAt?: number;
  errorCode?: string;
  errorMessage?: string;
  lastSequence: number;
};

export type ChatRuntimeRecoverInput = {
  runId?: string;
};

export type ChatRuntimeRecoverResult =
  | {
      ok: true;
      recoveredRuns: string[];
    }
  | {
      ok: false;
      code: string;
      error: string;
    };
