/** v8.1 — Turn-precise retry helpers (pure functions). */

import type { ChatTurnLedger } from "./chatTurnLedger";
import type { ChatTurnRequestSnapshot } from "./chatTurnSnapshot";
import type { ChatRunContextSnapshot } from "../ports/ChatRunContextPort";

export type RetryPlan =
  | {
      ok: true;
      mode: "retry" | "retry_current" | "edit";
      turnId: string;
      snapshot: ChatTurnRequestSnapshot;
      /** Retry must reuse original user message — no duplicate append. */
      skipAppendUser: true;
      contextRestore?: ChatRunContextSnapshot;
    }
  | { ok: false; error: string };

export function planRetryTurn(
  ledger: ChatTurnLedger,
  turnId: string,
): RetryPlan {
  const record = ledger.get(turnId);
  if (!record) {
    return { ok: false, error: `No turn record for ${turnId}` };
  }
  return {
    ok: true,
    mode: "retry",
    turnId,
    snapshot: record.request,
    skipAppendUser: true,
  };
}

export function planEditAndRetry(
  ledger: ChatTurnLedger,
  turnId: string,
): RetryPlan {
  const record = ledger.get(turnId);
  if (!record) {
    return { ok: false, error: `No turn record for ${turnId}` };
  }
  const snap = record.request;
  return {
    ok: true,
    mode: "edit",
    turnId,
    snapshot: snap,
    skipAppendUser: true,
    contextRestore: {
      expertId: snap.expertId,
      teamId: snap.teamId,
      skillName: snap.skillName,
      workMode: snap.workMode,
      permissionMode: snap.permissionMode,
      promptHintMode: snap.promptHintMode,
      modelId: snap.modelId,
    },
  };
}

export function planRetryWithCurrentContext(
  ledger: ChatTurnLedger,
  turnId: string,
  current: ChatRunContextSnapshot,
): RetryPlan {
  const record = ledger.get(turnId);
  if (!record) {
    return { ok: false, error: `No turn record for ${turnId}` };
  }
  const snap: ChatTurnRequestSnapshot = {
    ...record.request,
    modelId: current.modelId ?? record.request.modelId,
    expertId: current.expertId ?? record.request.expertId,
    teamId: current.teamId ?? record.request.teamId,
    skillName: current.skillName ?? record.request.skillName,
    workMode: current.workMode ?? record.request.workMode,
    permissionMode: current.permissionMode ?? record.request.permissionMode,
    promptHintMode: current.promptHintMode ?? record.request.promptHintMode,
  };
  return {
    ok: true,
    mode: "retry_current",
    turnId,
    snapshot: snap,
    skipAppendUser: true,
  };
}
