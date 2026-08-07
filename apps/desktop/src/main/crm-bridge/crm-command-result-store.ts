import type {
  CrmBridgeResult,
  CrmDesktopCommandAck,
  CrmDesktopCommandType,
} from "../../shared/crm-bridge/crm-bridge-contract";

type PendingCommandResult = {
  commandId: string;
  resolve: (result: CrmBridgeResult & { data?: unknown }) => void;
  timer: NodeJS.Timeout;
  createdAt: string;
};

const pendingResults = new Map<string, PendingCommandResult>();

const DEFAULT_TIMEOUT_MS = 8000;

export function waitForCrmCommandResult(
  commandId: string,
  _type: CrmDesktopCommandType,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<CrmBridgeResult & { data?: unknown }> {
  const existing = pendingResults.get(commandId);
  if (existing) {
    clearTimeout(existing.timer);
    pendingResults.delete(commandId);
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingResults.delete(commandId);
      resolve({
        ok: false,
        requestId: commandId,
        errorCode: "COMMAND_ACK_TIMEOUT",
        message: "CRM command ack timeout",
      });
    }, timeoutMs);

    pendingResults.set(commandId, {
      commandId,
      resolve,
      timer,
      createdAt: new Date().toISOString(),
    });
  });
}

export function resolveCrmCommandResult(ack: CrmDesktopCommandAck): void {
  if (!ack?.commandId || typeof ack.commandId !== "string") {
    return;
  }

  const pending = pendingResults.get(ack.commandId);
  if (!pending) {
    return;
  }

  clearTimeout(pending.timer);
  pendingResults.delete(ack.commandId);

  pending.resolve({
    ok: ack.ok,
    requestId: ack.commandId,
    action: ack.action,
    message: ack.message,
    errorCode: ack.ok
      ? undefined
      : ((ack.errorCode as CrmBridgeResult["errorCode"]) ?? "COMMAND_ACK_INVALID"),
    data: ack.data,
  });
}

export function rejectCrmCommandResult(commandId: string, message: string): void {
  const pending = pendingResults.get(commandId);
  if (!pending) {
    return;
  }

  clearTimeout(pending.timer);
  pendingResults.delete(commandId);

  pending.resolve({
    ok: false,
    requestId: commandId,
    errorCode: "COMMAND_ACK_INVALID",
    message,
  });
}
