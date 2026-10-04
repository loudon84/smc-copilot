import { BrowserWindow, ipcMain } from "electron";
// @lat: [[remote-expert-acp]]
import {
  REMOTE_EXPERT_IPC_CHANNELS,
  type RemoteExpertSubmitInput,
  type RemoteExpertCancelInput,
  type RemoteExpertCloseInput,
  type RemoteExpertResumeInput,
  type RemoteExpertPermissionDecisionInput,
} from "../../shared/remote-expert-acp/ipc";
import { RemoteExpertError } from "../../shared/remote-expert-acp/errors";
import { verifyPinnedContract } from "./contract-lock";
import { evaluateRemoteExpertFeatureGate, isPackagedApp } from "./remote-expert-feature-gate";
import { fetchRemoteExpertCatalog, assertCatalogDtoHasNoSecrets } from "./catalog-client";
import { getDbConnection } from "../db";
import { getRemoteExpertBindingBySessionId } from "./remote-expert-binding-store";
import {
  cancelRemoteExpertTurn,
  closeRemoteExpertSession,
  decideRemoteExpertPermission,
  resumeRemoteExpertSession,
  submitRemoteExpertTurn,
} from "./acp-session-manager";
import { REMOTE_EXPERT_PROVIDER } from "../../shared/remote-expert-acp/contract";
import { disposeAllAcpProcesses } from "./acp-process-manager";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sanitizeError(err: unknown): { error: string; code: string } {
  if (err instanceof RemoteExpertError) {
    return { error: err.message, code: err.code };
  }
  return { error: "remote expert failed", code: "ACP_PROTOCOL_ERROR" };
}

export function registerRemoteExpertIpc(options?: {
  getMainWindow?: () => BrowserWindow | null;
}): void {
  void options;
  ipcMain.handle(REMOTE_EXPERT_IPC_CHANNELS.GET_AVAILABILITY, async () => {
    try {
      const pin = verifyPinnedContract();
      return evaluateRemoteExpertFeatureGate({ packed: isPackagedApp(), lock: pin.lock });
    } catch (err) {
      return {
        enabled: false,
        mode: "off",
        packed: isPackagedApp(),
        ...sanitizeError(err),
        errorCode: sanitizeError(err).code,
        reason: sanitizeError(err).error,
      };
    }
  });

  ipcMain.handle(REMOTE_EXPERT_IPC_CHANNELS.LIST_CATALOG, async () => {
    const list = await fetchRemoteExpertCatalog();
    assertCatalogDtoHasNoSecrets(list);
    return list;
  });

  ipcMain.handle(REMOTE_EXPERT_IPC_CHANNELS.GET_BINDING, async (_event, sessionId: unknown) => {
    if (typeof sessionId !== "string" || !sessionId.trim()) {
      throw new RemoteExpertError("REMOTE_IPC_INVALID_INPUT", "sessionId required");
    }
    const db = getDbConnection(true);
    if (!db) return null;
    const row = getRemoteExpertBindingBySessionId(db, sessionId.trim());
    if (!row) return null;
    return {
      sessionId: row.sessionId,
      provider: REMOTE_EXPERT_PROVIDER,
      agentRef: row.agentRef,
      acpSessionId: row.acpSessionId,
      profileName: row.profileName,
      profileDigest: row.profileDigest,
      knowledgeRefs: row.knowledgeRefs,
      connectorBindingRefs: row.connectorBindingRefs,
      integrationAccountRefs: row.integrationAccountRefs,
      state: row.state,
    };
  });

  ipcMain.handle(REMOTE_EXPERT_IPC_CHANNELS.SUBMIT, async (_event, raw: unknown) => {
    if (!isRecord(raw) || typeof raw.sessionId !== "string" || typeof raw.turnId !== "string") {
      throw new RemoteExpertError("REMOTE_IPC_INVALID_INPUT", "submit payload invalid");
    }
    if (!isRecord(raw.profile) || typeof raw.profile.agent_ref !== "string") {
      throw new RemoteExpertError("REMOTE_IPC_INVALID_INPUT", "profile required");
    }
    const input: RemoteExpertSubmitInput = {
      sessionId: raw.sessionId,
      turnId: raw.turnId,
      profileId: typeof raw.profileId === "string" ? raw.profileId : "default",
      sessionScope: typeof raw.sessionScope === "string" ? raw.sessionScope : "",
      text: typeof raw.text === "string" ? raw.text : "",
      fileIds: Array.isArray(raw.fileIds)
        ? raw.fileIds.filter((id): id is string => typeof id === "string")
        : [],
      profile: {
        name: typeof raw.profile.name === "string" ? raw.profile.name : raw.profile.agent_ref,
        agent_ref: raw.profile.agent_ref,
        knowledge_refs: Array.isArray(raw.profile.knowledge_refs)
          ? raw.profile.knowledge_refs.filter((id): id is string => typeof id === "string")
          : [],
        connector_binding_refs: Array.isArray(raw.profile.connector_binding_refs)
          ? raw.profile.connector_binding_refs.filter((id): id is string => typeof id === "string")
          : [],
        integration_account_refs: Array.isArray(raw.profile.integration_account_refs)
          ? raw.profile.integration_account_refs.filter((id): id is string => typeof id === "string")
          : [],
      },
    };
    return submitRemoteExpertTurn(input);
  });

  ipcMain.handle(REMOTE_EXPERT_IPC_CHANNELS.CANCEL, async (_event, raw: unknown) => {
    const input = raw as RemoteExpertCancelInput;
    if (!isRecord(raw) || typeof input.sessionId !== "string") {
      throw new RemoteExpertError("REMOTE_IPC_INVALID_INPUT", "sessionId required");
    }
    cancelRemoteExpertTurn(input.sessionId);
  });

  ipcMain.handle(REMOTE_EXPERT_IPC_CHANNELS.CLOSE, async (_event, raw: unknown) => {
    const input = raw as RemoteExpertCloseInput;
    if (!isRecord(raw) || typeof input.sessionId !== "string") {
      throw new RemoteExpertError("REMOTE_IPC_INVALID_INPUT", "sessionId required");
    }
    await closeRemoteExpertSession(input.sessionId);
  });

  ipcMain.handle(REMOTE_EXPERT_IPC_CHANNELS.RESUME, async (_event, raw: unknown) => {
    const input = raw as RemoteExpertResumeInput;
    if (!isRecord(raw) || typeof input.sessionId !== "string") {
      throw new RemoteExpertError("REMOTE_IPC_INVALID_INPUT", "sessionId required");
    }
    await resumeRemoteExpertSession({
      sessionId: input.sessionId,
      profileId: input.profileId || "default",
      sessionScope: input.sessionScope || "",
    });
    const db = getDbConnection(true);
    return db ? getRemoteExpertBindingBySessionId(db, input.sessionId) : null;
  });

  ipcMain.handle(REMOTE_EXPERT_IPC_CHANNELS.DECIDE_PERMISSION, async (_event, raw: unknown) => {
    const input = raw as RemoteExpertPermissionDecisionInput;
    if (
      !isRecord(raw) ||
      typeof input.sessionId !== "string" ||
      typeof input.requestId !== "string" ||
      (input.optionId !== "allow_once" && input.optionId !== "reject_once")
    ) {
      throw new RemoteExpertError("REMOTE_IPC_INVALID_INPUT", "permission payload invalid");
    }
    decideRemoteExpertPermission(input.sessionId, input.requestId, input.optionId);
  });
}

export function disposeRemoteExpertSubsystem(): void {
  disposeAllAcpProcesses();
}
