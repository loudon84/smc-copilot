import { ipcMain, type BrowserWindow } from "electron";
import type {
  CrmBridgeOnEventPayload,
  CrmBridgeResult,
  CrmBridgeStoredEvent,
  CrmDesktopCommandAck,
} from "../../shared/crm-bridge/crm-bridge-contract";
import { CrmBridgeEvents } from "../../shared/crm-bridge/crm-bridge-contract";
import type { ValidateCrmBridgeEventSuccess } from "./crm-bridge-security";
import type { BrowserController } from "../browser/browser-controller";
import type { BrowserViewPort } from "../browser/browser-viewport";
import { validateCrmBridgeEvent } from "./crm-bridge-security";
import { routeCrmBridgeEvent } from "./crm-event-router";
import { dispatchCrmCommand } from "./crm-command-dispatcher";
import { resolveCrmCommandResult } from "./crm-command-result-store";
import { handleCrmPageReadyForHandoff } from "./crm-handoff-orchestrator";
import { insertCrmBridgeEvent, listCrmBridgeEvents, getLastCrmBridgeEvent } from "./crm-event-store";
import { logCrmBridgeAudit } from "./crm-bridge-audit";
import type { CrmBridgeAuditAction } from "../../shared/crm-bridge/crm-bridge-errors";

function toHandoffAuditAction(action?: string, ok?: boolean): CrmBridgeAuditAction {
  if (action === "crm.handoff.none") return "crm.handoff.none";
  if (action === "crm.handoff.delivered") return "crm.handoff.delivered";
  if (action === "crm.handoff.failed") return "crm.handoff.failed";
  return ok ? "crm.handoff.delivered" : "crm.handoff.failed";
}

function isValidCommandAck(raw: unknown): raw is CrmDesktopCommandAck {
  if (!raw || typeof raw !== "object") return false;
  const ack = raw as CrmDesktopCommandAck;
  return (
    typeof ack.commandId === "string" &&
    typeof ack.ok === "boolean" &&
    typeof ack.type === "string" &&
    typeof ack.receivedAt === "string" &&
    typeof ack.completedAt === "string"
  );
}

export class CrmBridgeIPC {
  private registered = false;

  constructor(
    private readonly controller: BrowserController,
    private readonly viewManager: BrowserViewPort,
    private getMainWindow: () => BrowserWindow | null,
  ) {}

  register(): void {
    if (this.registered) return;

    ipcMain.handle("crm-bridge:emit", async (event, input) => {
      const validation = validateCrmBridgeEvent({
        sender: event.sender,
        frame: event.senderFrame,
        input,
        viewManager: this.viewManager,
      });

      if (!validation.ok) {
        const failed = validation as CrmBridgeResult;
        logCrmBridgeAudit({
          requestId: failed.requestId,
          action: "crm.event.rejected",
          status: "blocked",
          errorCode: failed.errorCode,
          message: failed.message,
        });
        return failed;
      }

      const { event: bridgeEvent, origin } = validation as ValidateCrmBridgeEventSuccess;

      const stored: CrmBridgeStoredEvent = {
        ...bridgeEvent,
        webContentsId: event.sender.id,
        origin,
        createdAt: new Date().toISOString(),
      };

      insertCrmBridgeEvent(stored);

      logCrmBridgeAudit({
        requestId: bridgeEvent.requestId,
        eventType: bridgeEvent.type,
        origin,
        url: bridgeEvent.page.url,
        entityType: bridgeEvent.page.entityType,
        entityId: bridgeEvent.page.entityId,
        action: "crm.event.received",
        status: "success",
      });

      const routeAction = await routeCrmBridgeEvent({
        sender: event.sender,
        event: bridgeEvent,
        controller: this.controller,
        mainWindow: this.getMainWindow(),
      });

      if (routeAction.ok) {
        logCrmBridgeAudit({
          requestId: bridgeEvent.requestId,
          eventType: bridgeEvent.type,
          action: "crm.event.routed",
          status: "success",
          message: routeAction.action,
        });
      } else {
        logCrmBridgeAudit({
          requestId: bridgeEvent.requestId,
          eventType: bridgeEvent.type,
          action: "crm.event.rejected",
          status: "failed",
          errorCode: "ROUTE_NOT_FOUND",
          message: routeAction.message,
        });
      }

      const payload: CrmBridgeOnEventPayload = {
        event: stored,
        routeAction,
      };

      const mainWindow = this.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(CrmBridgeEvents.ON_EVENT, payload);
      }

      if (bridgeEvent.type === "crm.page.ready") {
        void handleCrmPageReadyForHandoff({
          readyEvent: stored,
          viewManager: this.viewManager,
        }).then((handoffResult) => {
          logCrmBridgeAudit({
            requestId: handoffResult.requestId,
            eventType: bridgeEvent.type,
            action: toHandoffAuditAction(handoffResult.action, handoffResult.ok),
            status: handoffResult.ok ? "success" : "failed",
            errorCode: handoffResult.errorCode,
            message: handoffResult.message,
          });
        });
      }

      return {
        ok: routeAction.ok,
        requestId: bridgeEvent.requestId,
        action: routeAction.action,
        message: routeAction.message,
      } satisfies CrmBridgeResult;
    });

    ipcMain.handle("crm-bridge:list-events", async (_event, limit = 20) => {
      return listCrmBridgeEvents(limit);
    });

    ipcMain.handle("crm-bridge:get-last-event", async () => {
      return getLastCrmBridgeEvent();
    });

    ipcMain.handle("crm-bridge:send-command", async (_event, command) => {
      const result = await dispatchCrmCommand(command, this.viewManager);
      logCrmBridgeAudit({
        requestId: result.requestId,
        action: result.ok ? "crm.command.completed" : "crm.command.failed",
        status: result.ok ? "success" : "failed",
        errorCode: result.errorCode,
        message: result.message,
      });
      return result;
    });

    ipcMain.handle("crm-bridge:command-result", async (event, ack) => {
      const wc = this.viewManager.getExternalWebContents();

      if (!wc || wc.isDestroyed() || wc.id !== event.sender.id) {
        return {
          ok: false,
          requestId: isValidCommandAck(ack) ? ack.commandId : "",
          errorCode: "ORIGIN_NOT_ALLOWED",
          message: "CRM command result sender is not active WebOperator view",
        } satisfies CrmBridgeResult;
      }

      if (!isValidCommandAck(ack)) {
        return {
          ok: false,
          requestId: "",
          errorCode: "COMMAND_ACK_INVALID",
          message: "Invalid CRM command ack",
        } satisfies CrmBridgeResult;
      }

      resolveCrmCommandResult(ack);
      return { ok: true, requestId: ack.commandId } satisfies CrmBridgeResult;
    });

    this.registered = true;
  }

  unregister(): void {
    if (!this.registered) return;
    const channels = [
      "crm-bridge:emit",
      "crm-bridge:list-events",
      "crm-bridge:get-last-event",
      "crm-bridge:send-command",
      "crm-bridge:command-result",
    ];
    for (const ch of channels) {
      ipcMain.removeHandler(ch);
    }
    this.registered = false;
  }
}
