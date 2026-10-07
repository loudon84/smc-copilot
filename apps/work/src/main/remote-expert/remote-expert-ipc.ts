import { app, BrowserWindow, ipcMain } from "electron";
// @lat: [[remote-expert]]
import {
  REMOTE_EXPERT_IPC_CHANNELS,
  RemoteExpertError,
  sanitizeRemoteExpertDto,
  type RemoteExpertTurnRequest,
} from "../../shared/remote-expert";
import {
  ensureCompatibleContract,
  getContractGateState,
} from "./remote-expert-contract-gate";
import { fetchRemoteExpertCatalog } from "./remote-expert-catalog-client";
import { getRemoteAcpSessionRef } from "./remote-expert-session-store";
import {
  cancelRemoteExpertTurn,
  closeRemoteExpertSession,
  decideRemoteExpertPermission,
  disposeRemoteExpertSubsystem,
  resumeRemoteExpertSession,
  setRemoteExpertWindowGetter,
  submitRemoteExpertTurn,
} from "./remote-expert-turn-service";

function isPackagedApp(): boolean {
  try {
    return app.isPackaged;
  } catch {
    return false;
  }
}

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
  setRemoteExpertWindowGetter(options?.getMainWindow ?? (() => null));

  ipcMain.handle(REMOTE_EXPERT_IPC_CHANNELS.GET_AVAILABILITY, async () => {
    try {
      await ensureCompatibleContract();
      return sanitizeRemoteExpertDto({
        enabled: getContractGateState() === "COMPATIBLE",
        gateState: getContractGateState(),
        packed: isPackagedApp(),
      });
    } catch (err) {
      const mapped = sanitizeError(err);
      const mismatches =
        err instanceof RemoteExpertError &&
        Array.isArray(err.details?.mismatches)
          ? err.details.mismatches
          : undefined;
      return sanitizeRemoteExpertDto({
        enabled: false,
        gateState: getContractGateState(),
        packed: isPackagedApp(),
        reason: mapped.error,
        errorCode: mapped.code,
        ...(mismatches ? { mismatches } : {}),
      });
    }
  });

  ipcMain.handle(REMOTE_EXPERT_IPC_CHANNELS.LIST_CATALOG, async () => {
    try {
      const list = await fetchRemoteExpertCatalog();
      return sanitizeRemoteExpertDto(list);
    } catch (err) {
      if (err instanceof RemoteExpertError) {
        throw new Error(`${err.code}: ${err.message}`);
      }
      const mapped = sanitizeError(err);
      throw new Error(`${mapped.code}: ${mapped.error}`);
    }
  });

  ipcMain.handle(
    REMOTE_EXPERT_IPC_CHANNELS.GET_SESSION,
    async (_event, sessionId: unknown) => {
      if (typeof sessionId !== "string" || !sessionId.trim()) {
        throw new RemoteExpertError(
          "REMOTE_IPC_INVALID_INPUT",
          "sessionId required",
        );
      }
      return sanitizeRemoteExpertDto(
        getRemoteAcpSessionRef(sessionId.trim()),
      );
    },
  );

  ipcMain.handle(REMOTE_EXPERT_IPC_CHANNELS.SUBMIT, async (_event, raw: unknown) => {
    if (!isRecord(raw)) {
      throw new RemoteExpertError("REMOTE_IPC_INVALID_INPUT", "submit invalid");
    }
    const input = sanitizeRemoteExpertDto(raw) as unknown as RemoteExpertTurnRequest;
    return submitRemoteExpertTurn(input);
  });

  ipcMain.handle(REMOTE_EXPERT_IPC_CHANNELS.CANCEL, async (_event, raw: unknown) => {
    if (!isRecord(raw) || typeof raw.sessionId !== "string") {
      throw new RemoteExpertError("REMOTE_IPC_INVALID_INPUT", "sessionId");
    }
    await cancelRemoteExpertTurn(raw.sessionId);
  });

  ipcMain.handle(REMOTE_EXPERT_IPC_CHANNELS.CLOSE, async (_event, raw: unknown) => {
    if (!isRecord(raw) || typeof raw.sessionId !== "string") {
      throw new RemoteExpertError("REMOTE_IPC_INVALID_INPUT", "sessionId");
    }
    await closeRemoteExpertSession(raw.sessionId);
  });

  ipcMain.handle(REMOTE_EXPERT_IPC_CHANNELS.RESUME, async (_event, raw: unknown) => {
    if (!isRecord(raw) || typeof raw.sessionId !== "string") {
      throw new RemoteExpertError("REMOTE_IPC_INVALID_INPUT", "sessionId");
    }
    return resumeRemoteExpertSession({
      sessionId: raw.sessionId,
      authGeneration:
        typeof raw.authGeneration === "string" ? raw.authGeneration : "",
    });
  });

  ipcMain.handle(
    REMOTE_EXPERT_IPC_CHANNELS.DECIDE_PERMISSION,
    async (_event, raw: unknown) => {
      if (
        !isRecord(raw) ||
        typeof raw.sessionId !== "string" ||
        typeof raw.requestId !== "string" ||
        (raw.optionId !== "allow_once" && raw.optionId !== "reject_once")
      ) {
        throw new RemoteExpertError("REMOTE_IPC_INVALID_INPUT", "permission");
      }
      decideRemoteExpertPermission({
        sessionId: raw.sessionId,
        requestId: raw.requestId,
        optionId: raw.optionId,
        authGeneration:
          typeof raw.authGeneration === "string" ? raw.authGeneration : "",
      });
    },
  );
}

export { disposeRemoteExpertSubsystem };
