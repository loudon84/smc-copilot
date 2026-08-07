import { randomUUID } from "crypto";
import { webContents } from "electron";
import type {
  HostBridgeResult,
  HostDesktopCommand,
} from "../../shared/crm-bridge/host-bridge-contract";
import { HostBridgeEvents } from "../../shared/crm-bridge/host-bridge-contract";
import { adaptLegacyCommandToHost } from "../../shared/crm-bridge/host-bridge-legacy-adapter";
import { getWebContentsForTabLayer, getWebOperatorTabWebContentsId } from "../browser/web-operator-tabs";
import { waitForHostCommandResult } from "./host-command-result-store";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCommand(raw: unknown): HostDesktopCommand | null {
  const adapted = adaptLegacyCommandToHost(raw);
  if (adapted) return adapted;

  if (!isRecord(raw) || typeof raw.type !== "string") return null;

  const type = raw.type.startsWith("desktop.host.") || raw.type.startsWith("desktop.crm.")
    ? raw.type
    : null;
  if (!type) return null;

  return {
    commandId:
      typeof raw.commandId === "string" && raw.commandId.trim()
        ? raw.commandId
        : randomUUID(),
    type,
    formType: typeof raw.formType === "string" ? raw.formType : undefined,
    action: typeof raw.action === "string" ? raw.action : undefined,
    target: isRecord(raw.target)
      ? (raw.target as HostDesktopCommand["target"])
      : undefined,
    payload: isRecord(raw.payload) ? raw.payload : undefined,
    createdAt:
      typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    expectAck: typeof raw.expectAck === "boolean" ? raw.expectAck : undefined,
    timeoutMs: typeof raw.timeoutMs === "number" ? raw.timeoutMs : undefined,
  };
}

function shouldWaitForAck(command: HostDesktopCommand): boolean {
  if (command.expectAck === true) return true;
  if (command.expectAck === false) return false;
  return (
    command.type === "desktop.host.form.fill" ||
    command.type === "desktop.host.form.patch" ||
    command.type === "desktop.host.clickButton"
  );
}

function resolveTargetWebContents(tabLayerId?: string | null): Electron.WebContents | null {
  if (tabLayerId) {
    return getWebContentsForTabLayer(tabLayerId);
  }
  const primaryId = getWebOperatorTabWebContentsId(null);
  if (primaryId === null || typeof primaryId !== "number") return null;

  const wc = webContents.fromId(primaryId);
  return wc && !wc.isDestroyed() ? wc : null;
}

export async function dispatchHostCommand(
  commandInput: unknown,
  tabLayerId?: string | null,
): Promise<HostBridgeResult & { data?: unknown }> {
  const command = normalizeCommand(commandInput);
  if (!command) {
    return {
      ok: false,
      requestId: "",
      errorCode: "INVALID_SCHEMA",
      message: "Invalid Host command",
    };
  }

  const wc = resolveTargetWebContents(tabLayerId);
  if (!wc || wc.isDestroyed()) {
    return {
      ok: false,
      requestId: command.commandId,
      errorCode: "WEB_OPERATOR_NOT_READY",
      message: "WebOperator view is not ready",
    };
  }

  const replyRequired = shouldWaitForAck(command);

  wc.send(HostBridgeEvents.COMMAND, command);

  const commandJson = JSON.stringify(command);
  void wc
    .executeJavaScript(
      `(function(){ window.postMessage({ source: 'copilot-desktop', channel: 'host.desktop.command', protocolVersion: '6.0', command: ${commandJson}, replyRequired: ${replyRequired} }, window.location.origin); window.postMessage({ source: 'copilot-desktop', channel: 'crm.desktop.command', protocolVersion: '6.0', command: ${commandJson}, replyRequired: ${replyRequired} }, window.location.origin); })();`,
      true,
    )
    .catch((error) => {
      console.warn("[HOST-BRIDGE] postMessage command fallback failed:", error);
    });

  if (!replyRequired) {
    return {
      ok: true,
      requestId: command.commandId,
      action: "host.command.sent",
      message: "Command dispatched to host page",
    };
  }

  return waitForHostCommandResult(command.commandId, command.timeoutMs ?? 8000);
}
