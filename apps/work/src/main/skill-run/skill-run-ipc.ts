/**
 * Skill Run Main IPC registration.
 * Narrow DTO surface with sender validation and sanitized errors.
 */

import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import {
  SKILL_RUN_IPC_CHANNELS,
  type SkillCatalogResponse,
  type SkillRunCancelInput,
  type SkillRunCancelResult,
  type SkillRunFeatureMode,
  type SkillRunProjection,
  type SkillRunRetryArtifactDiscoveryInput,
  type SkillRunStartInput,
  type SkillRunStartResult,
} from "../../shared/skill-run";
import {
  createSkillRunService,
  SkillRunService,
} from "./skill-run-service";
import {
  rehydrateSkillRunContinuationsForSession,
  upsertSkillRunContinuationProjection,
} from "./skill-run-continuation";
import { materializeSkillRunSessionTranscript } from "./skill-run-session-materialize";
import { upsertSkillRunRemoteArtifact } from "../files/upsert-skill-run-remote-artifact";

let activeService: SkillRunService | null = null;
let projectionUnsubscribe: (() => void) | null = null;

function broadcastProjection(projection: SkillRunProjection): void {
  // 1. Continuation persistence
  upsertSkillRunContinuationProjection(projection);

  // 2. Materialize transcript bubble on terminal/result
  materializeSkillRunSessionTranscript(projection);

  // 3. Forward to all renderer windows
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(
        SKILL_RUN_IPC_CHANNELS.ON_PROJECTION_CHANGED,
        projection,
      );
    }
  }
}

export function getSkillRunService(): SkillRunService {
  if (!activeService) {
    activeService = createSkillRunService({
      onUpsertArtifact: async (input) => {
        upsertSkillRunRemoteArtifact(input);
      },
    });
    projectionUnsubscribe = activeService.subscribe(broadcastProjection);
  }
  return activeService;
}

export function disposeSkillRunSubsystem(): void {
  if (projectionUnsubscribe) {
    projectionUnsubscribe();
    projectionUnsubscribe = null;
  }
  activeService?.dispose();
  activeService = null;
}

export function resetSkillRunServiceForTests(): void {
  disposeSkillRunSubsystem();
}

function assertSender(event: IpcMainInvokeEvent): void {
  const wc = event.sender;
  if (!wc || wc.isDestroyed()) {
    throw new Error("Invalid IPC sender");
  }
}

export function registerSkillRunIpc(): () => void {
  const listHandler = async (
    event: IpcMainInvokeEvent,
  ): Promise<SkillCatalogResponse> => {
    assertSender(event);
    const service = getSkillRunService();
    return service.listCatalog();
  };

  const refreshHandler = async (
    event: IpcMainInvokeEvent,
  ): Promise<SkillCatalogResponse> => {
    assertSender(event);
    const service = getSkillRunService();
    return service.refreshCatalog();
  };

  const startHandler = async (
    event: IpcMainInvokeEvent,
    input: unknown,
  ): Promise<SkillRunStartResult> => {
    assertSender(event);
    if (!input || typeof input !== "object") {
      throw new Error("Invalid SkillRunStartInput");
    }
    const raw = input as Record<string, unknown>;
    const sanitized: SkillRunStartInput = {
      toolName: String(raw.toolName || ""),
      prompt: String(raw.prompt || ""),
      clientRequestId: String(raw.clientRequestId || ""),
      sessionId: String(raw.sessionId || ""),
      profileId: String(raw.profileId || ""),
      authGeneration: raw.authGeneration ? String(raw.authGeneration) : undefined,
    };
    const service = getSkillRunService();
    return service.start(sanitized);
  };

  const cancelHandler = async (
    event: IpcMainInvokeEvent,
    input: unknown,
  ): Promise<SkillRunCancelResult> => {
    assertSender(event);
    if (!input || typeof input !== "object") {
      throw new Error("Invalid SkillRunCancelInput");
    }
    const raw = input as Record<string, unknown>;
    const sanitized: SkillRunCancelInput = {
      clientRequestId: String(raw.clientRequestId || ""),
      sessionId: String(raw.sessionId || ""),
    };
    const service = getSkillRunService();
    return service.cancel(sanitized);
  };

  const getFeatureModeHandler = async (
    event: IpcMainInvokeEvent,
  ): Promise<{ mode: SkillRunFeatureMode }> => {
    assertSender(event);
    const service = getSkillRunService();
    return { mode: service.getFeatureMode() };
  };

  const getProjectionHandler = async (
    event: IpcMainInvokeEvent,
    clientRequestId: unknown,
  ): Promise<SkillRunProjection | null> => {
    assertSender(event);
    const service = getSkillRunService();
    return service.getProjection(String(clientRequestId || ""));
  };

  const listProjectionsHandler = async (
    event: IpcMainInvokeEvent,
    sessionId: unknown,
  ): Promise<SkillRunProjection[]> => {
    assertSender(event);
    const service = getSkillRunService();
    return service.listProjections(String(sessionId || ""));
  };

  const rehydrateSessionHandler = async (
    event: IpcMainInvokeEvent,
    sessionId: unknown,
  ): Promise<SkillRunProjection[]> => {
    assertSender(event);
    return rehydrateSkillRunContinuationsForSession(String(sessionId || ""));
  };

  const retryArtifactDiscoveryHandler = async (
    event: IpcMainInvokeEvent,
    input: unknown,
  ): Promise<SkillRunProjection | null> => {
    assertSender(event);
    if (!input || typeof input !== "object") {
      throw new Error("Invalid SkillRunRetryArtifactDiscoveryInput");
    }
    const raw = input as Record<string, unknown>;
    const sanitized: SkillRunRetryArtifactDiscoveryInput = {
      clientRequestId: String(raw.clientRequestId || ""),
      sessionId: String(raw.sessionId || ""),
    };
    const service = getSkillRunService();
    return service.retryArtifactDiscovery(sanitized);
  };

  ipcMain.handle(SKILL_RUN_IPC_CHANNELS.LIST_CATALOG, listHandler);
  ipcMain.handle(SKILL_RUN_IPC_CHANNELS.REFRESH_CATALOG, refreshHandler);
  ipcMain.handle(SKILL_RUN_IPC_CHANNELS.START, startHandler);
  ipcMain.handle(SKILL_RUN_IPC_CHANNELS.CANCEL, cancelHandler);
  ipcMain.handle(SKILL_RUN_IPC_CHANNELS.GET_FEATURE_MODE, getFeatureModeHandler);
  ipcMain.handle(SKILL_RUN_IPC_CHANNELS.GET_PROJECTION, getProjectionHandler);
  ipcMain.handle(SKILL_RUN_IPC_CHANNELS.LIST_PROJECTIONS, listProjectionsHandler);
  ipcMain.handle(SKILL_RUN_IPC_CHANNELS.REHYDRATE_SESSION, rehydrateSessionHandler);
  ipcMain.handle(SKILL_RUN_IPC_CHANNELS.RETRY_ARTIFACT_DISCOVERY, retryArtifactDiscoveryHandler);

  return () => {
    ipcMain.removeHandler(SKILL_RUN_IPC_CHANNELS.LIST_CATALOG);
    ipcMain.removeHandler(SKILL_RUN_IPC_CHANNELS.REFRESH_CATALOG);
    ipcMain.removeHandler(SKILL_RUN_IPC_CHANNELS.START);
    ipcMain.removeHandler(SKILL_RUN_IPC_CHANNELS.CANCEL);
    ipcMain.removeHandler(SKILL_RUN_IPC_CHANNELS.GET_FEATURE_MODE);
    ipcMain.removeHandler(SKILL_RUN_IPC_CHANNELS.GET_PROJECTION);
    ipcMain.removeHandler(SKILL_RUN_IPC_CHANNELS.LIST_PROJECTIONS);
    ipcMain.removeHandler(SKILL_RUN_IPC_CHANNELS.REHYDRATE_SESSION);
    ipcMain.removeHandler(SKILL_RUN_IPC_CHANNELS.RETRY_ARTIFACT_DISCOVERY);
  };
}
