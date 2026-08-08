import { ipcMain, BrowserWindow } from "electron";
import {
  initAiOsServices,
  getAiOsRuntimeStatus,
  getAiOsRuntimeSnapshot,
} from "./aios-runtime-supervisor";
import { reconcileAiOsRuntime } from "./aios-reconciler";
import { checkPortConflicts } from "./aios-port-check";
import { getAiOsEnvConfig } from "./aios-config";
import { resolveAiosHomeUrl } from "./aios-home-url";
import { getAiOsPortalInfo } from "./aios-paths";
import { listRuntimeServiceEvents } from "../profile-runtime-db";
import type { AiOsServiceId, AiOsLogQueryOptions } from "../../shared/aios/aios-contract";

/** PRD v1.4 — Portal process control moved to external Runtime. */
const PORTAL_PROCESS_CONTROL_MOVED =
  "Portal Runtime process control moved to external Runtime. Desktop no longer starts Portal.";

function rejectPortalProcessControl(): never {
  throw new Error(PORTAL_PROCESS_CONTROL_MOVED);
}

export function registerAiosIpc(_mainWindow: BrowserWindow): void {
  try {
    // Seed status records only — do not spawn Portal processes (PRD v1.4).
    initAiOsServices();
  } catch (err) {
    console.error("[AIOS] Failed to init services:", err);
  }

  // Reconcile state from previous run (health probe only; no spawn)
  reconcileAiOsRuntime().catch((err) => {
    console.error("[AIOS] Reconcile failed:", err);
  });

  ipcMain.handle("aios:get-runtime-status", () => {
    return getAiOsRuntimeStatus();
  });

  ipcMain.handle("aios:get-runtime-snapshot", () => {
    return getAiOsRuntimeSnapshot();
  });

  ipcMain.handle("aios:start", async () => {
    rejectPortalProcessControl();
  });

  ipcMain.handle("aios:stop", async () => {
    rejectPortalProcessControl();
  });

  ipcMain.handle("aios:restart", async () => {
    rejectPortalProcessControl();
  });

  ipcMain.handle("aios:get-logs", (_event, serviceId: AiOsServiceId, options?: AiOsLogQueryOptions) => {
    const events = listRuntimeServiceEvents(serviceId, {
      limit: options?.limit,
      level: options?.level,
      since: options?.since,
    });
    return events.map((e) => ({
      timestamp: e.created_at,
      level: e.level,
      message: e.message,
      service: e.service_id as AiOsServiceId,
    }));
  });

  ipcMain.handle("aios:doctor", async () => {
    rejectPortalProcessControl();
  });

  ipcMain.handle("aios:reconcile", async () => {
    return reconcileAiOsRuntime();
  });

  ipcMain.handle("aios:check-ports", async () => {
    const config = getAiOsEnvConfig();
    return checkPortConflicts([config.backendPort, config.frontendPort]);
  });

  ipcMain.handle("aios:get-home-url", () => {
    return { url: resolveAiosHomeUrl() };
  });

  ipcMain.handle("aios:get-portal-info", () => {
    return getAiOsPortalInfo();
  });
}
