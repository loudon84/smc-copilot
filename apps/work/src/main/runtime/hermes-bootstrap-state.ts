/**
 * Hermes Native Bootstrap state (PRD C-007 / A-INSTALL-003).
 * INSTALLING | ABSENT | FAIL | REPO_MISMATCH → local chat rejected.
 * READY → local chat allowed. Main window opens regardless.
 */
export type HermesBootstrapState =
  | "ABSENT"
  | "INSTALLING"
  | "READY"
  | "FAIL"
  | "REPO_MISMATCH";

export const HERMES_BOOTSTRAP_CHAT_BLOCKED = "HERMES_BOOTSTRAP_NOT_READY";
export const HERMES_REPO_ORIGIN_MISMATCH = "HERMES_REPO_ORIGIN_MISMATCH";

let bootstrapState: HermesBootstrapState = "ABSENT";
let bootstrapErrorCode: string | null = null;
let bootstrapErrorMessage: string | null = null;
let bootstrapOperationId: string | null = null;
let lastSkippedReason: string | null = null;

export interface HermesBootstrapStatus {
  state: HermesBootstrapState;
  operationId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  skippedReason: string | null;
  allowsLocalChat: boolean;
}

export function getBootstrapState(): HermesBootstrapState {
  return bootstrapState;
}

export function getBootstrapStatus(): HermesBootstrapStatus {
  return {
    state: bootstrapState,
    operationId: bootstrapOperationId,
    errorCode: bootstrapErrorCode,
    errorMessage: bootstrapErrorMessage,
    skippedReason: lastSkippedReason,
    allowsLocalChat: canAcceptLocalChat(),
  };
}

export function setBootstrapState(
  state: HermesBootstrapState,
  extras?: {
    errorCode?: string | null;
    errorMessage?: string | null;
    operationId?: string | null;
    skippedReason?: string | null;
  },
): void {
  bootstrapState = state;
  if (extras?.errorCode !== undefined) bootstrapErrorCode = extras.errorCode;
  if (extras?.errorMessage !== undefined) {
    bootstrapErrorMessage = extras.errorMessage;
  }
  if (extras?.operationId !== undefined) {
    bootstrapOperationId = extras.operationId;
  }
  if (extras?.skippedReason !== undefined) {
    lastSkippedReason = extras.skippedReason;
  }
  if (state === "READY") {
    bootstrapErrorCode = null;
    bootstrapErrorMessage = null;
  }
}

export function resetBootstrapStateForTests(): void {
  bootstrapState = "ABSENT";
  bootstrapErrorCode = null;
  bootstrapErrorMessage = null;
  bootstrapOperationId = null;
  lastSkippedReason = null;
}

/** A-INSTALL-003: local chat only when READY. */
export function canAcceptLocalChat(): boolean {
  return bootstrapState === "READY";
}

export function assertLocalChatAllowed(): void {
  if (canAcceptLocalChat()) return;
  const detail =
    bootstrapErrorMessage ||
    `Hermes bootstrap state is ${bootstrapState}; local chat is blocked until READY.`;
  const err = new Error(detail) as Error & { code?: string };
  err.code = bootstrapErrorCode || HERMES_BOOTSTRAP_CHAT_BLOCKED;
  throw err;
}
