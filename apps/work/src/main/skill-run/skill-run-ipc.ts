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
  type SkillRunDecideApprovalInput,
  type SkillRunDecideApprovalResult,
  type SkillRunFeatureMode,
  type SkillRunProjection,
  type SkillRunRetryArtifactDiscoveryInput,
  type SkillRunSessionModeSnapshot,
  type SkillRunSetCatalogFavoriteInput,
  type SkillRunStartInput,
  type SkillRunStartResult,
} from "../../shared/skill-run";
import { ensureFreshAccessToken } from "../auth/ensure-access-token";
import { readStoredSessionSync } from "../auth/token-store";
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
import {
  getSkillRunSessionMode,
  setSkillRunSessionMode,
} from "./skill-run-session-mode-store";

const MAX_PROMPT_LENGTH = 32_000;
const MAX_TOOL_NAME_LENGTH = 256;
const MAX_CLIENT_REQUEST_ID_LENGTH = 128;
const MAX_SESSION_ID_LENGTH = 256;
const MAX_PROFILE_ID_LENGTH = 128;
const EXTRA_PARAMETERS_MAX = 8;
const FILE_IDS_MAX = 10;
const FILE_ID_MAX_LENGTH = 128;
const ATTACHMENT_REF_ID_PATTERN = /^att_/i;
const FILE_ID_PATH_PATTERN = /[\\/]|^[A-Za-z]:/;

let activeService: SkillRunService | null = null;
let projectionUnsubscribe: (() => void) | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function requireAuthSession(): Promise<{ userId: string }> {
  await ensureFreshAccessToken();
  const session = readStoredSessionSync();
  return { userId: session?.user?.id ?? "unknown" };
}

function assertAuthGeneration(
  authGeneration: string | undefined,
  userId: string,
): void {
  if (!authGeneration || userId === "unknown") return;
  const expected = [`user:${userId}`, userId];
  if (!expected.includes(authGeneration)) {
    throw new Error("Auth generation mismatch");
  }
}

function validateStartInput(value: unknown): SkillRunStartInput {
  if (!isRecord(value)) throw new Error("Invalid SkillRunStartInput");
  const requiredStrings = [
    "toolName",
    "prompt",
    "clientRequestId",
    "sessionId",
    "profileId",
    "authGeneration",
  ] as const;
  for (const key of requiredStrings) {
    if (typeof value[key] !== "string" || !String(value[key]).trim()) {
      throw new Error(`Invalid SkillRunStartInput.${key}`);
    }
  }
  const toolName = String(value.toolName).trim();
  const prompt = String(value.prompt);
  const clientRequestId = String(value.clientRequestId).trim();
  const sessionId = String(value.sessionId).trim();
  const profileId = String(value.profileId).trim();
  const authGeneration = String(value.authGeneration).trim();

  if (toolName.length > MAX_TOOL_NAME_LENGTH) {
    throw new Error("Invalid SkillRunStartInput.toolName");
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new Error("Invalid SkillRunStartInput.prompt");
  }
  if (clientRequestId.length > MAX_CLIENT_REQUEST_ID_LENGTH) {
    throw new Error("Invalid SkillRunStartInput.clientRequestId");
  }
  if (sessionId.length > MAX_SESSION_ID_LENGTH) {
    throw new Error("Invalid SkillRunStartInput.sessionId");
  }
  if (profileId.length > MAX_PROFILE_ID_LENGTH) {
    throw new Error("Invalid SkillRunStartInput.profileId");
  }

  let extraParameters: Record<string, string> | undefined;
  if (value.extraParameters !== undefined) {
    if (!isRecord(value.extraParameters)) {
      throw new Error("Invalid SkillRunStartInput.extraParameters");
    }
    const keys = Object.keys(value.extraParameters);
    if (keys.length > EXTRA_PARAMETERS_MAX) {
      throw new Error("Invalid SkillRunStartInput.extraParameters");
    }
    extraParameters = {};
    for (const key of keys) {
      const trimmedKey = key.trim();
      const rawValue = value.extraParameters[key];
      if (
        !trimmedKey ||
        trimmedKey.length > MAX_TOOL_NAME_LENGTH ||
        typeof rawValue !== "string" ||
        rawValue.length > MAX_PROMPT_LENGTH
      ) {
        throw new Error("Invalid SkillRunStartInput.extraParameters");
      }
      extraParameters[trimmedKey] = rawValue;
    }
  }

  if (
    "attachment_refs" in value ||
    "attachmentRefs" in value ||
    "path" in value
  ) {
    throw new Error("Invalid SkillRunStartInput");
  }

  let fileIds: string[] | undefined;
  if (value.fileIds !== undefined) {
    if (!Array.isArray(value.fileIds)) {
      throw new Error("Invalid SkillRunStartInput.fileIds");
    }
    if (value.fileIds.length > FILE_IDS_MAX) {
      throw new Error("Invalid SkillRunStartInput.fileIds");
    }
    const seen = new Set<string>();
    fileIds = [];
    for (const item of value.fileIds) {
      if (typeof item !== "string") {
        throw new Error("Invalid SkillRunStartInput.fileIds");
      }
      const id = item.trim();
      if (
        !id ||
        id.length > FILE_ID_MAX_LENGTH ||
        ATTACHMENT_REF_ID_PATTERN.test(id) ||
        FILE_ID_PATH_PATTERN.test(id) ||
        seen.has(id)
      ) {
        throw new Error("Invalid SkillRunStartInput.fileIds");
      }
      seen.add(id);
      fileIds.push(id);
    }
    if (fileIds.length === 0) {
      fileIds = undefined;
    }
  }

  return {
    toolName,
    prompt,
    clientRequestId,
    sessionId,
    profileId,
    authGeneration,
    ...(extraParameters ? { extraParameters } : {}),
    ...(fileIds ? { fileIds } : {}),
  };
}

function validateSetCatalogFavoriteInput(value: unknown): SkillRunSetCatalogFavoriteInput {
  if (!isRecord(value)) throw new Error("Invalid SkillRunSetCatalogFavoriteInput");
  if (typeof value.toolName !== "string" || !String(value.toolName).trim()) {
    throw new Error("Invalid SkillRunSetCatalogFavoriteInput.toolName");
  }
  const toolName = String(value.toolName).trim();
  if (toolName.length > MAX_TOOL_NAME_LENGTH) {
    throw new Error("Invalid SkillRunSetCatalogFavoriteInput.toolName");
  }
  if (typeof value.favorited !== "boolean") {
    throw new Error("Invalid SkillRunSetCatalogFavoriteInput.favorited");
  }
  return { toolName, favorited: value.favorited };
}

function broadcastProjection(projection: SkillRunProjection): void {
  upsertSkillRunContinuationProjection(projection);
  materializeSkillRunSessionTranscript(projection);
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
      onPersistContinuation: upsertSkillRunContinuationProjection,
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
    await requireAuthSession();
    const service = getSkillRunService();
    return service.listCatalog();
  };

  const refreshHandler = async (
    event: IpcMainInvokeEvent,
  ): Promise<SkillCatalogResponse> => {
    assertSender(event);
    await requireAuthSession();
    const service = getSkillRunService();
    return service.refreshCatalog();
  };

  const setCatalogFavoriteHandler = async (
    event: IpcMainInvokeEvent,
    input: unknown,
  ): Promise<SkillCatalogResponse> => {
    assertSender(event);
    await requireAuthSession();
    const sanitized = validateSetCatalogFavoriteInput(input);
    const service = getSkillRunService();
    return service.setCatalogFavorite(sanitized);
  };

  const startHandler = async (
    event: IpcMainInvokeEvent,
    input: unknown,
  ): Promise<SkillRunStartResult> => {
    assertSender(event);
    const { userId } = await requireAuthSession();
    const sanitized = validateStartInput(input);
    assertAuthGeneration(sanitized.authGeneration, userId);
    const service = getSkillRunService();
    return service.start(sanitized);
  };

  const cancelHandler = async (
    event: IpcMainInvokeEvent,
    input: unknown,
  ): Promise<SkillRunCancelResult> => {
    assertSender(event);
    await requireAuthSession();
    if (!isRecord(input)) {
      throw new Error("Invalid SkillRunCancelInput");
    }
    const clientRequestId = String(input.clientRequestId || "").trim();
    const sessionId = String(input.sessionId || "").trim();
    if (!clientRequestId || !sessionId) {
      throw new Error("Invalid SkillRunCancelInput");
    }
    const sanitized: SkillRunCancelInput = { clientRequestId, sessionId };
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
    await requireAuthSession();
    const trimmed = String(sessionId || "").trim();
    if (!trimmed) return [];
    return rehydrateSkillRunContinuationsForSession(trimmed);
  };

  const retryArtifactDiscoveryHandler = async (
    event: IpcMainInvokeEvent,
    input: unknown,
  ): Promise<SkillRunProjection | null> => {
    assertSender(event);
    await requireAuthSession();
    if (!isRecord(input)) {
      throw new Error("Invalid SkillRunRetryArtifactDiscoveryInput");
    }
    const clientRequestId = String(input.clientRequestId || "").trim();
    const sessionId = String(input.sessionId || "").trim();
    if (!clientRequestId || !sessionId) {
      throw new Error("Invalid SkillRunRetryArtifactDiscoveryInput");
    }
    const sanitized: SkillRunRetryArtifactDiscoveryInput = {
      clientRequestId,
      sessionId,
    };
    const service = getSkillRunService();
    return service.retryArtifactDiscovery(sanitized);
  };

  const decideApprovalHandler = async (
    event: IpcMainInvokeEvent,
    input: unknown,
  ): Promise<SkillRunDecideApprovalResult> => {
    assertSender(event);
    await requireAuthSession();
    if (!isRecord(input)) {
      throw new Error("Invalid SkillRunDecideApprovalInput");
    }
    if ("approvalId" in input || "idempotencyKey" in input) {
      throw new Error("Invalid SkillRunDecideApprovalInput");
    }
    const clientRequestId = String(input.clientRequestId || "").trim();
    const sessionId = String(input.sessionId || "").trim();
    if (!clientRequestId || !sessionId) {
      throw new Error("Invalid SkillRunDecideApprovalInput");
    }
    if (clientRequestId.length > MAX_CLIENT_REQUEST_ID_LENGTH) {
      throw new Error("Invalid SkillRunDecideApprovalInput.clientRequestId");
    }
    if (sessionId.length > MAX_SESSION_ID_LENGTH) {
      throw new Error("Invalid SkillRunDecideApprovalInput.sessionId");
    }
    if (input.decision !== "allow" && input.decision !== "deny") {
      throw new Error("Invalid SkillRunDecideApprovalInput.decision");
    }
    const sanitized: SkillRunDecideApprovalInput = {
      clientRequestId,
      sessionId,
      decision: input.decision,
    };
    const service = getSkillRunService();
    return service.decideApproval(sanitized);
  };

  const getSessionModeHandler = async (
    event: IpcMainInvokeEvent,
    sessionId: unknown,
  ): Promise<SkillRunSessionModeSnapshot | null> => {
    assertSender(event);
    const trimmed = String(sessionId || "").trim();
    if (!trimmed) return null;
    return getSkillRunSessionMode(trimmed);
  };

  const setSessionModeHandler = async (
    event: IpcMainInvokeEvent,
    input: unknown,
  ): Promise<void> => {
    assertSender(event);
    if (!isRecord(input)) throw new Error("Invalid session mode input");
    const sessionId = String(input.sessionId || "").trim();
    const toolName = String(input.toolName || "").trim();
    const toolTitle = String(input.toolTitle || "").trim();
    const updatedAt = String(input.updatedAt || "").trim();
    if (!sessionId || !toolName || !toolTitle || !updatedAt) {
      throw new Error("Invalid session mode input");
    }
    if (input.executionMode !== "skill-run") {
      throw new Error("Invalid session mode executionMode");
    }
    setSkillRunSessionMode(sessionId, {
      executionMode: "skill-run",
      toolName,
      toolTitle,
      updatedAt,
    });
  };

  ipcMain.handle(SKILL_RUN_IPC_CHANNELS.LIST_CATALOG, listHandler);
  ipcMain.handle(SKILL_RUN_IPC_CHANNELS.REFRESH_CATALOG, refreshHandler);
  ipcMain.handle(SKILL_RUN_IPC_CHANNELS.SET_CATALOG_FAVORITE, setCatalogFavoriteHandler);
  ipcMain.handle(SKILL_RUN_IPC_CHANNELS.START, startHandler);
  ipcMain.handle(SKILL_RUN_IPC_CHANNELS.CANCEL, cancelHandler);
  ipcMain.handle(SKILL_RUN_IPC_CHANNELS.GET_FEATURE_MODE, getFeatureModeHandler);
  ipcMain.handle(SKILL_RUN_IPC_CHANNELS.GET_PROJECTION, getProjectionHandler);
  ipcMain.handle(SKILL_RUN_IPC_CHANNELS.LIST_PROJECTIONS, listProjectionsHandler);
  ipcMain.handle(SKILL_RUN_IPC_CHANNELS.REHYDRATE_SESSION, rehydrateSessionHandler);
  ipcMain.handle(SKILL_RUN_IPC_CHANNELS.RETRY_ARTIFACT_DISCOVERY, retryArtifactDiscoveryHandler);
  ipcMain.handle(SKILL_RUN_IPC_CHANNELS.DECIDE_APPROVAL, decideApprovalHandler);
  ipcMain.handle(SKILL_RUN_IPC_CHANNELS.GET_SESSION_MODE, getSessionModeHandler);
  ipcMain.handle(SKILL_RUN_IPC_CHANNELS.SET_SESSION_MODE, setSessionModeHandler);

  return () => {
    ipcMain.removeHandler(SKILL_RUN_IPC_CHANNELS.LIST_CATALOG);
    ipcMain.removeHandler(SKILL_RUN_IPC_CHANNELS.REFRESH_CATALOG);
    ipcMain.removeHandler(SKILL_RUN_IPC_CHANNELS.SET_CATALOG_FAVORITE);
    ipcMain.removeHandler(SKILL_RUN_IPC_CHANNELS.START);
    ipcMain.removeHandler(SKILL_RUN_IPC_CHANNELS.CANCEL);
    ipcMain.removeHandler(SKILL_RUN_IPC_CHANNELS.GET_FEATURE_MODE);
    ipcMain.removeHandler(SKILL_RUN_IPC_CHANNELS.GET_PROJECTION);
    ipcMain.removeHandler(SKILL_RUN_IPC_CHANNELS.LIST_PROJECTIONS);
    ipcMain.removeHandler(SKILL_RUN_IPC_CHANNELS.REHYDRATE_SESSION);
    ipcMain.removeHandler(SKILL_RUN_IPC_CHANNELS.RETRY_ARTIFACT_DISCOVERY);
    ipcMain.removeHandler(SKILL_RUN_IPC_CHANNELS.DECIDE_APPROVAL);
    ipcMain.removeHandler(SKILL_RUN_IPC_CHANNELS.GET_SESSION_MODE);
    ipcMain.removeHandler(SKILL_RUN_IPC_CHANNELS.SET_SESSION_MODE);
  };
}
