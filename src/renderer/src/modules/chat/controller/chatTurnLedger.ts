/** v8.1 — Turn Ledger: turnId → request/response/error mapping. */

import type { ChatUsage } from "@shared/chat-runtime/chat-runtime-events";
import type { ChatTurnRequestSnapshot } from "./chatTurnSnapshot";

export type ChatTurnLedgerStatus =
  | "pending"
  | "streaming"
  | "waiting_clarify"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type ChatTurnRecord = {
  turnId: string;
  runId: string;
  request: ChatTurnRequestSnapshot;
  userMessageId: string;
  assistantMessageId?: string;
  errorMessageId?: string;
  status: ChatTurnLedgerStatus;
  usage?: ChatUsage;
  startedAt: number;
  completedAt?: number;
};

export type ChatTurnLedger = Map<string, ChatTurnRecord>;

export function createEmptyTurnLedger(): ChatTurnLedger {
  return new Map();
}

export function upsertTurnRecord(
  ledger: ChatTurnLedger,
  record: ChatTurnRecord,
): ChatTurnLedger {
  const next = new Map(ledger);
  next.set(record.turnId, record);
  return next;
}

export function getTurnRecord(
  ledger: ChatTurnLedger,
  turnId: string,
): ChatTurnRecord | undefined {
  return ledger.get(turnId);
}

export function markTurnFailed(
  ledger: ChatTurnLedger,
  turnId: string,
  errorMessageId: string,
): ChatTurnLedger {
  const existing = ledger.get(turnId);
  if (!existing) return ledger;
  return upsertTurnRecord(ledger, {
    ...existing,
    status: "failed",
    errorMessageId,
    completedAt: Date.now(),
  });
}

export function markTurnCompleted(
  ledger: ChatTurnLedger,
  turnId: string,
): ChatTurnLedger {
  const existing = ledger.get(turnId);
  if (!existing) return ledger;
  return upsertTurnRecord(ledger, {
    ...existing,
    status: "completed",
    completedAt: Date.now(),
  });
}
