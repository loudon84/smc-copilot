import type { HostBridgeResult, HostDesktopCommandAck } from "../../shared/crm-bridge/host-bridge-contract";

type PendingCommandResult = {
  commandId: string;
  resolve: (result: HostBridgeResult & { data?: unknown }) => void;
  timer: NodeJS.Timeout;
};

const pendingResults = new Map<string, PendingCommandResult>();
const DEFAULT_TIMEOUT_MS = 8000;

export function waitForHostCommandResult(
  commandId: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<HostBridgeResult & { data?: unknown }> {
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
        message: "Host command ack timeout",
      });
    }, timeoutMs);

    pendingResults.set(commandId, { commandId, resolve, timer });
  });
}

export function resolveHostCommandResult(ack: HostDesktopCommandAck): void {
  if (!ack?.commandId) return;

  const pending = pendingResults.get(ack.commandId);
  if (!pending) return;

  clearTimeout(pending.timer);
  pendingResults.delete(ack.commandId);

  pending.resolve({
    ok: ack.ok,
    requestId: ack.commandId,
    action: ack.action,
    message: ack.message,
    errorCode: ack.ok ? undefined : "COMMAND_ACK_INVALID",
    data: ack.data,
  });
}
