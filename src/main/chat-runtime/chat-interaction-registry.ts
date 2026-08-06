/** v8.0.5 — Pending Clarify / Approval registry helpers. */

export type PendingInteraction =
  | {
      type: "clarify";
      requestId: string;
      turnId: string;
      createdAt: number;
      resolved?: boolean;
    }
  | {
      type: "approval";
      requestId: string;
      turnId: string;
      toolName: string;
      createdAt: number;
      resolved?: boolean;
    };

export function createPendingClarify(
  requestId: string,
  turnId: string,
): PendingInteraction {
  return {
    type: "clarify",
    requestId,
    turnId,
    createdAt: Date.now(),
  };
}

export function createPendingApproval(
  requestId: string,
  turnId: string,
  toolName: string,
): PendingInteraction {
  return {
    type: "approval",
    requestId,
    turnId,
    toolName,
    createdAt: Date.now(),
  };
}

export type InteractionValidateFailure =
  | "RUN_NOT_FOUND"
  | "TURN_MISMATCH"
  | "REQUEST_NOT_FOUND"
  | "REQUEST_ALREADY_RESOLVED"
  | "INVALID_STATE";

export function validatePendingInteraction(input: {
  pending: PendingInteraction | undefined;
  commandTurnId: string;
  commandType: "clarify.respond" | "approval.approve" | "approval.deny";
  expectKind: "clarify" | "approval";
}): InteractionValidateFailure | null {
  const { pending, commandTurnId, commandType, expectKind } = input;
  if (!pending) return "REQUEST_NOT_FOUND";
  if (pending.resolved) return "REQUEST_ALREADY_RESOLVED";
  if (pending.turnId !== commandTurnId) return "TURN_MISMATCH";
  if (pending.type !== expectKind) return "INVALID_STATE";
  if (expectKind === "clarify" && commandType !== "clarify.respond") {
    return "INVALID_STATE";
  }
  if (
    expectKind === "approval" &&
    commandType !== "approval.approve" &&
    commandType !== "approval.deny"
  ) {
    return "INVALID_STATE";
  }
  return null;
}
