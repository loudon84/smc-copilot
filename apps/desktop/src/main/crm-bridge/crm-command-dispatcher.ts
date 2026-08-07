import { randomUUID } from "crypto";
import type {
  CrmBridgeResult,
  CrmDesktopCommand,
  CrmDesktopCommandType,
} from "../../shared/crm-bridge/crm-bridge-contract";
import { CrmBridgeEvents } from "../../shared/crm-bridge/crm-bridge-contract";
import type { BrowserViewPort } from "../browser/browser-viewport";
import { waitForCrmCommandResult } from "./crm-command-result-store";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCommand(raw: unknown): CrmDesktopCommand | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.type !== "string" || !raw.type.startsWith("desktop.crm.")) {
    return null;
  }
  return {
    commandId:
      typeof raw.commandId === "string" && raw.commandId.trim()
        ? raw.commandId
        : randomUUID(),
    type: raw.type as CrmDesktopCommand["type"],
    target: isRecord(raw.target)
      ? {
          selector:
            typeof raw.target.selector === "string" ? raw.target.selector : undefined,
          fieldName:
            typeof raw.target.fieldName === "string" ? raw.target.fieldName : undefined,
          entityId:
            typeof raw.target.entityId === "string" ? raw.target.entityId : undefined,
          frameId:
            typeof raw.target.frameId === "string" ? raw.target.frameId : undefined,
          actionKey:
            typeof raw.target.actionKey === "string" ? raw.target.actionKey : undefined,
        }
      : undefined,
    payload: isRecord(raw.payload) ? raw.payload : undefined,
    createdAt:
      typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    expectAck: typeof raw.expectAck === "boolean" ? raw.expectAck : undefined,
    timeoutMs: typeof raw.timeoutMs === "number" ? raw.timeoutMs : undefined,
  };
}

function shouldWaitForAck(command: CrmDesktopCommand): boolean {
  if (command.expectAck === true) return true;
  if (command.expectAck === false) return false;

  return (
    command.type === "desktop.crm.clickButton" ||
    command.type === "desktop.crm.runAction" ||
    command.type === "desktop.crm.pushJson" ||
    command.type === "desktop.crm.product.create"
  );
}

export async function dispatchCrmCommand(
  commandInput: unknown,
  viewManager: BrowserViewPort,
): Promise<CrmBridgeResult & { data?: unknown }> {
  const command = normalizeCommand(commandInput);
  if (!command) {
    return {
      ok: false,
      requestId: "",
      errorCode: "INVALID_SCHEMA",
      message: "Invalid CRM command",
    };
  }

  const wc = viewManager.getExternalWebContents();
  if (!wc || wc.isDestroyed()) {
    return {
      ok: false,
      requestId: command.commandId,
      errorCode: "WEB_OPERATOR_NOT_READY",
      message: "WebOperator view is not ready",
    };
  }

  const replyRequired = shouldWaitForAck(command);

  wc.send(CrmBridgeEvents.COMMAND, command);

  // Redundant delivery: some WebContentsView builds miss preload IPC listeners.
  const commandJson = JSON.stringify(command);
  void wc
    .executeJavaScript(
      `(function(){ window.postMessage({ source: 'copilot-desktop', channel: 'crm.desktop.command', version: '0.2.0', command: ${commandJson}, replyRequired: ${replyRequired} }, window.location.origin); })();`,
      true,
    )
    .catch((error) => {
      console.warn("[CRM-BRIDGE] postMessage command fallback failed:", error);
    });

  if (!replyRequired) {
    return {
      ok: true,
      requestId: command.commandId,
      action: "crm.command.sent",
      message: "Command dispatched to CRM page",
    };
  }

  return waitForCrmCommandResult(
    command.commandId,
    command.type as CrmDesktopCommandType,
    command.timeoutMs ?? 8000,
  );
}
