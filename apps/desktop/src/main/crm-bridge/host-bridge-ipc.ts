import { ipcMain, type BrowserWindow } from "electron";
import type {
  HostBridgeEmitInput,
  HostBridgeOnEventPayload,
  HostBridgeResult,
  HostBridgeStoredEvent,
  HostBridgeStoredReadyEvent,
  HostBridgeSubmitEvent,
  HostDesktopCommandAck,
} from "../../shared/crm-bridge/host-bridge-contract";
import { HostBridgeEvents } from "../../shared/crm-bridge/host-bridge-contract";
import { CrmBridgeEvents } from "../../shared/crm-bridge/crm-bridge-contract";
import type { BrowserController } from "../browser/browser-controller";
import {
  getActiveWebOperatorLayerId,
  getWebOperatorTabWebContentsId,
} from "../browser/web-operator-tabs";
import { logHostBridgeAudit } from "./host-bridge-audit";
import {
  getHostBridgeConfig,
  getHostBridgeConfigPath,
  openHostBridgeConfigFile,
  reloadHostBridgeConfig,
} from "./host-bridge-config";
import { dispatchHostCommand } from "./host-command-dispatcher";
import { resolveHostCommandResult } from "./host-command-result-store";
import { routeHostBridgeEvent } from "./host-event-router";
import {
  getLastHostBridgeEvent,
  getLastHostBridgeReadyEvent,
  insertHostBridgeReadyEvent,
  insertHostBridgeSubmitEvent,
  listHostBridgeEvents,
} from "./host-event-store";
import { handleHostPageReady } from "./host-handoff-orchestrator";
import {
  clearLatestHostHandoff,
  getLastHostHandoff,
  listHostHandoffs,
} from "./host-handoff-store";
import {
  validateHostBridgeEvent,
  type ValidateHostBridgeEventSuccess,
} from "./host-bridge-security";

function isValidCommandAck(raw: unknown): raw is HostDesktopCommandAck {
  if (!raw || typeof raw !== "object") return false;
  const ack = raw as HostDesktopCommandAck;
  return (
    typeof ack.commandId === "string" &&
    typeof ack.ok === "boolean" &&
    typeof ack.type === "string" &&
    typeof ack.receivedAt === "string" &&
    typeof ack.completedAt === "string"
  );
}

function isHostWebContents(senderId: number): boolean {
  const anyIds = getWebOperatorTabWebContentsId("any");
  if (Array.isArray(anyIds) && anyIds.includes(senderId)) {
    return true;
  }
  const primary = getWebOperatorTabWebContentsId(null);
  return typeof primary === "number" && primary === senderId;
}

async function processHostEvent(
  validation: ValidateHostBridgeEventSuccess,
  deps: {
    controller: BrowserController;
    getMainWindow: () => BrowserWindow | null;
  },
): Promise<HostBridgeResult> {
  const { event, origin } = validation;

  if (event.type === "host.page.ready") {
    const stored: HostBridgeStoredReadyEvent = {
      ...event,
      origin,
      createdAt: new Date().toISOString(),
    };
    insertHostBridgeReadyEvent(stored);

    logHostBridgeAudit({
      requestId: event.requestId,
      eventType: event.type,
      origin,
      url: event.pageContext.url,
      auditAction: "host.event.received",
      status: "success",
    });

    const handoffResult = await handleHostPageReady(stored);

    logHostBridgeAudit({
      requestId: handoffResult.requestId,
      eventType: event.type,
      auditAction:
        handoffResult.action === "host.handoff.delivered"
          ? "host.handoff.delivered"
          : handoffResult.action === "host.handoff.none"
            ? "host.handoff.none"
            : "host.handoff.failed",
      status: handoffResult.ok ? "success" : "failed",
      message: handoffResult.message,
    });

    const payload: HostBridgeOnEventPayload = {
      event: stored,
      routeAction: { ok: handoffResult.ok, action: handoffResult.action, message: handoffResult.message },
    };

    const mainWindow = deps.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(HostBridgeEvents.ON_EVENT, payload);
    }

    return handoffResult;
  }

  const submitEvent = event as HostBridgeSubmitEvent;
  const stored: HostBridgeStoredEvent = {
    ...submitEvent,
    origin,
    createdAt: new Date().toISOString(),
  };

  insertHostBridgeSubmitEvent(stored);

  logHostBridgeAudit({
    requestId: submitEvent.requestId,
    formType: submitEvent.formType,
    action: submitEvent.action,
    origin,
    url: submitEvent.pageContext.url,
    entityType: submitEvent.pageContext.entityType,
    entityId: submitEvent.pageContext.entityId,
    auditAction: "host.event.received",
    status: "success",
  });

  const routeAction = await routeHostBridgeEvent({
    event: submitEvent,
    controller: deps.controller,
    mainWindow: deps.getMainWindow(),
  });

  if (routeAction.ok) {
    logHostBridgeAudit({
      requestId: submitEvent.requestId,
      auditAction: "host.event.routed",
      status: "success",
      message: routeAction.action,
    });
  } else {
    logHostBridgeAudit({
      requestId: submitEvent.requestId,
      auditAction: "host.event.rejected",
      status: "failed",
      errorCode: "ROUTE_NOT_FOUND",
      message: routeAction.message,
    });
  }

  const payload: HostBridgeOnEventPayload = {
    event: stored,
    routeAction,
  };

  const mainWindow = deps.getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(HostBridgeEvents.ON_EVENT, payload);
    mainWindow.webContents.send(CrmBridgeEvents.ON_EVENT, payload);
  }

  return {
    ok: routeAction.ok,
    requestId: submitEvent.requestId,
    action: routeAction.action,
    message: routeAction.message,
  };
}

export class HostBridgeIPC {
  private registered = false;

  constructor(
    private readonly controller: BrowserController,
    private readonly getMainWindow: () => BrowserWindow | null,
  ) {}

  register(): void {
    if (this.registered) return;

    const emitHandler = async (
      event: Electron.IpcMainInvokeEvent,
      input: unknown,
    ): Promise<HostBridgeResult> => {
      const validation = validateHostBridgeEvent({
        sender: event.sender,
        frame: event.senderFrame,
        input: input as HostBridgeEmitInput,
      });

      if (!validation.ok) {
        const failed = validation as HostBridgeResult;
        logHostBridgeAudit({
          requestId: failed.requestId,
          auditAction: "host.event.rejected",
          status: "blocked",
          errorCode: failed.errorCode,
          message: failed.message,
        });
        return failed;
      }

      return processHostEvent(validation as ValidateHostBridgeEventSuccess, {
        controller: this.controller,
        getMainWindow: this.getMainWindow,
      });
    };

    ipcMain.handle("host-bridge:emit", emitHandler);
    ipcMain.handle("host-bridge:page-ready", emitHandler);

    ipcMain.handle("crm-bridge:emit", emitHandler);

    ipcMain.handle("host-bridge:list-events", async (_event, limit = 20) => {
      return listHostBridgeEvents(limit);
    });

    ipcMain.handle("host-bridge:get-last-event", async () => {
      return getLastHostBridgeEvent();
    });

    ipcMain.handle("host-bridge:get-last-ready-event", async () => {
      return getLastHostBridgeReadyEvent();
    });

    ipcMain.handle("crm-bridge:list-events", async (_event, limit = 20) => {
      return listHostBridgeEvents(limit);
    });

    ipcMain.handle("crm-bridge:get-last-event", async () => {
      return getLastHostBridgeEvent();
    });

    ipcMain.handle(
      "host-bridge:send-command",
      async (_event, command, tabLayerId?: string | null) => {
      const layerId =
        typeof tabLayerId === "string" && tabLayerId.trim()
          ? tabLayerId.trim()
          : getActiveWebOperatorLayerId();
      const result = await dispatchHostCommand(command, layerId);
      logHostBridgeAudit({
        requestId: result.requestId,
        auditAction: result.ok ? "host.command.completed" : "host.command.failed",
        status: result.ok ? "success" : "failed",
        message: result.message,
      });
      return result;
      },
    );

    ipcMain.handle("crm-bridge:send-command", async (_event, command, tabLayerId?: string | null) => {
      const layerId =
        typeof tabLayerId === "string" && tabLayerId.trim()
          ? tabLayerId.trim()
          : getActiveWebOperatorLayerId();
      const result = await dispatchHostCommand(command, layerId);
      logHostBridgeAudit({
        requestId: result.requestId,
        auditAction: result.ok ? "host.command.completed" : "host.command.failed",
        status: result.ok ? "success" : "failed",
        message: result.message,
      });
      return result;
    });

    const commandResultHandler = async (
      event: Electron.IpcMainInvokeEvent,
      ack: unknown,
    ): Promise<HostBridgeResult> => {
      if (!isHostWebContents(event.sender.id)) {
        return {
          ok: false,
          requestId: isValidCommandAck(ack) ? ack.commandId : "",
          errorCode: "ORIGIN_NOT_ALLOWED",
          message: "Command result sender is not active WebOperator view",
        };
      }

      if (!isValidCommandAck(ack)) {
        return {
          ok: false,
          requestId: "",
          errorCode: "COMMAND_ACK_INVALID",
          message: "Invalid Host command ack",
        };
      }

      resolveHostCommandResult(ack);
      return { ok: true, requestId: ack.commandId };
    };

    ipcMain.handle("host-bridge:command-result", commandResultHandler);
    ipcMain.handle("crm-bridge:command-result", commandResultHandler);

    ipcMain.handle("host-bridge:get-config", async () => getHostBridgeConfig());
    ipcMain.handle("host-bridge:get-config-path", async () => getHostBridgeConfigPath());
    ipcMain.handle("host-bridge:reload-config", async () => reloadHostBridgeConfig());
    ipcMain.handle("host-bridge:open-config-file", async () => {
      await openHostBridgeConfigFile();
      return { ok: true };
    });

    ipcMain.handle("host-bridge:get-last-handoff", async () => getLastHostHandoff());
    ipcMain.handle("host-bridge:list-handoffs", async (_event, limit = 20) =>
      listHostHandoffs(limit),
    );
    ipcMain.handle("host-bridge:clear-handoff", async () => {
      clearLatestHostHandoff();
      return { ok: true };
    });

    this.registered = true;
  }

  unregister(): void {
    if (!this.registered) return;
    const channels = [
      "host-bridge:emit",
      "host-bridge:page-ready",
      "host-bridge:list-events",
      "host-bridge:get-last-event",
      "host-bridge:send-command",
      "host-bridge:command-result",
      "host-bridge:get-config",
      "host-bridge:get-config-path",
      "host-bridge:reload-config",
      "host-bridge:open-config-file",
      "host-bridge:get-last-handoff",
      "host-bridge:list-handoffs",
      "host-bridge:clear-handoff",
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
