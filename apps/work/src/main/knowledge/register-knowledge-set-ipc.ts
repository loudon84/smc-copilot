/**
 * Register typed `knowledge-set:*` IPC. Product path is HTTP provider only
 * (no mock facade set entities).
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import {
  KNOWLEDGE_SET_IPC_CHANNELS,
  type KnowledgeProfileIdInput,
  type KnowledgeSetBindBaseInput,
  type KnowledgeSetCreateInput,
  type KnowledgeSetCreateProfileInput,
  type KnowledgeSetGetInput,
  type KnowledgeSetListInput,
  type KnowledgeSetListProfilesInput,
  type KnowledgeSetRollbackProfileInput,
  type KnowledgeSetUnbindBaseInput,
  type KnowledgeSetUpdateInput,
  type KnowledgeSetUpdateProfileInput,
} from "../../shared/knowledge/knowledge-set-ipc";
import { KnowledgeFacadeError } from "../../shared/knowledge/knowledge-errors";
import { getKnowledgeHttpProvider } from "./knowledge-http-provider";
import { readStoredSessionSync } from "../auth/token-store";

function sanitizeIpcError(err: unknown): Error {
  if (err instanceof KnowledgeFacadeError) {
    console.info("[knowledge-set]", {
      operationId: err.operationId,
      code: err.code,
      httpStatus: err.httpStatus,
    });
    return new Error(err.code);
  }
  if (err instanceof Error) {
    const code = err.message.split(/\s/)[0] ?? "KNOWLEDGE_UNAVAILABLE";
    if (/^[A-Z][A-Z0-9_]+$/.test(code)) {
      console.info("[knowledge-set]", { code });
      return new Error(code);
    }
    console.error("[knowledge-set]", err.name);
  }
  return new Error("KNOWLEDGE_UNAVAILABLE");
}

function requireAuth(): void {
  const session = readStoredSessionSync();
  if (!session?.user?.id?.trim()) {
    throw new Error("KNOWLEDGE_AUTH_REQUIRED");
  }
}

export function registerKnowledgeSetIpcHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    KNOWLEDGE_SET_IPC_CHANNELS.list,
    async (_e: IpcMainInvokeEvent, input?: KnowledgeSetListInput) => {
      try {
        requireAuth();
        return await getKnowledgeHttpProvider().listSets(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_SET_IPC_CHANNELS.get,
    async (_e: IpcMainInvokeEvent, input: KnowledgeSetGetInput) => {
      try {
        requireAuth();
        return await getKnowledgeHttpProvider().getSet(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_SET_IPC_CHANNELS.create,
    async (_e: IpcMainInvokeEvent, input: KnowledgeSetCreateInput) => {
      try {
        requireAuth();
        return await getKnowledgeHttpProvider().createSet(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_SET_IPC_CHANNELS.update,
    async (_e: IpcMainInvokeEvent, input: KnowledgeSetUpdateInput) => {
      try {
        requireAuth();
        return await getKnowledgeHttpProvider().updateSet(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_SET_IPC_CHANNELS.bindBase,
    async (_e: IpcMainInvokeEvent, input: KnowledgeSetBindBaseInput) => {
      try {
        requireAuth();
        return await getKnowledgeHttpProvider().bindSetBase(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_SET_IPC_CHANNELS.unbindBase,
    async (_e: IpcMainInvokeEvent, input: KnowledgeSetUnbindBaseInput) => {
      try {
        requireAuth();
        return await getKnowledgeHttpProvider().unbindSetBase(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_SET_IPC_CHANNELS.listProfiles,
    async (_e: IpcMainInvokeEvent, input: KnowledgeSetListProfilesInput) => {
      try {
        requireAuth();
        return await getKnowledgeHttpProvider().listRetrievalProfiles(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_SET_IPC_CHANNELS.createProfile,
    async (_e: IpcMainInvokeEvent, input: KnowledgeSetCreateProfileInput) => {
      try {
        requireAuth();
        return await getKnowledgeHttpProvider().createRetrievalProfile(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_SET_IPC_CHANNELS.getProfile,
    async (_e: IpcMainInvokeEvent, input: KnowledgeProfileIdInput) => {
      try {
        requireAuth();
        return await getKnowledgeHttpProvider().getRetrievalProfile(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_SET_IPC_CHANNELS.updateProfile,
    async (_e: IpcMainInvokeEvent, input: KnowledgeSetUpdateProfileInput) => {
      try {
        requireAuth();
        return await getKnowledgeHttpProvider().updateRetrievalProfile(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_SET_IPC_CHANNELS.publishProfile,
    async (_e: IpcMainInvokeEvent, input: KnowledgeProfileIdInput) => {
      try {
        requireAuth();
        return await getKnowledgeHttpProvider().publishRetrievalProfile(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_SET_IPC_CHANNELS.rollbackProfile,
    async (_e: IpcMainInvokeEvent, input: KnowledgeSetRollbackProfileInput) => {
      try {
        requireAuth();
        return await getKnowledgeHttpProvider().rollbackRetrievalProfile(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );
}
