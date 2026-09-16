/**
 * Register typed `knowledge-base:*` IPC. Delete is DELETE, never patch.deleted.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import {
  KNOWLEDGE_BASE_IPC_CHANNELS,
  type KnowledgeBaseCreateInput,
  type KnowledgeBaseDeleteInput,
  type KnowledgeBaseGetInput,
  type KnowledgeBaseListFilesInput,
  type KnowledgeBaseListInput,
  type KnowledgeBaseUpdateInput,
} from "../../shared/knowledge/knowledge-base-ipc";
import { KnowledgeFacadeError } from "../../shared/knowledge/knowledge-errors";
import { getKnowledgeModeSnapshot } from "./knowledge-mode-controller";
import { getKnowledgeHttpProvider } from "./knowledge-http-provider";
import { KnowledgeProviderFacade } from "./knowledge-provider-facade";
import { deriveKnowledgeJobPartition } from "./knowledge-upload-job-coordinator";
import { getActiveProfileNameSync } from "../utils";
import { readStoredSessionSync } from "../auth/token-store";

function sanitizeIpcError(err: unknown): Error {
  if (err instanceof KnowledgeFacadeError) {
    console.info("[knowledge-base]", {
      operationId: err.operationId,
      code: err.code,
      httpStatus: err.httpStatus,
    });
    return new Error(err.code);
  }
  if (err instanceof Error) {
    const code = err.message.split(/\s/)[0] ?? "KNOWLEDGE_UNAVAILABLE";
    if (/^[A-Z][A-Z0-9_]+$/.test(code)) {
      console.info("[knowledge-base]", { code });
      return new Error(code);
    }
    console.error("[knowledge-base]", err.name);
  }
  return new Error("KNOWLEDGE_UNAVAILABLE");
}

function requireAuth(): void {
  const session = readStoredSessionSync();
  if (!session?.user?.id?.trim()) {
    throw new Error("KNOWLEDGE_AUTH_REQUIRED");
  }
}

function mockFacade(): KnowledgeProviderFacade {
  return new KnowledgeProviderFacade({
    getMode: () => getKnowledgeModeSnapshot(),
    getPartition: () => {
      const session = readStoredSessionSync();
      const authSubject = session?.user?.id?.trim();
      if (!authSubject) throw new Error("KNOWLEDGE_AUTH_REQUIRED");
      return deriveKnowledgeJobPartition({
        workProfileId: getActiveProfileNameSync(),
        authSubject,
        tenantId: session?.user?.tenantId,
      });
    },
  });
}

function isMockMode(): boolean {
  try {
    return getKnowledgeModeSnapshot().dataMode === "mock";
  } catch {
    return false;
  }
}

function snapshotFromMockEntity(entity: {
  id: string;
  title?: string;
  permission?: { visibility?: string };
}): {
  id: string;
  name: string;
  description: string | null;
  status: "active";
  visibility: "private" | "department" | "organization";
} {
  const visibility = entity.permission?.visibility;
  return {
    id: entity.id,
    name: entity.title ?? entity.id,
    description: null,
    status: "active",
    visibility:
      visibility === "department" || visibility === "organization"
        ? visibility
        : "private",
  };
}

export function registerKnowledgeBaseIpcHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    KNOWLEDGE_BASE_IPC_CHANNELS.list,
    async (_e: IpcMainInvokeEvent, input?: KnowledgeBaseListInput) => {
      try {
        requireAuth();
        if (isMockMode()) {
          const facade = mockFacade();
          facade.ensureSeeded();
          const items = facade.listEntities({ kind: "base" }).map(snapshotFromMockEntity);
          return { items, total: items.length, page: 1, pageSize: items.length };
        }
        return await getKnowledgeHttpProvider().listBases(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_BASE_IPC_CHANNELS.get,
    async (_e: IpcMainInvokeEvent, input: KnowledgeBaseGetInput) => {
      try {
        requireAuth();
        if (isMockMode()) {
          const facade = mockFacade();
          facade.ensureSeeded();
          const entity = facade.getEntity({
            kind: "base",
            entityId: input.knowledgeBaseId,
          });
          if (!entity) throw new Error("KNOWLEDGE_NOT_FOUND");
          return snapshotFromMockEntity(entity);
        }
        return await getKnowledgeHttpProvider().getBase(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_BASE_IPC_CHANNELS.create,
    async (_e: IpcMainInvokeEvent, input: KnowledgeBaseCreateInput) => {
      try {
        requireAuth();
        if (isMockMode()) {
          const facade = mockFacade();
          facade.ensureSeeded();
          const entity = facade.mutateEntity({
            kind: "base",
            patch: { title: input.name },
          });
          return snapshotFromMockEntity(entity);
        }
        return await getKnowledgeHttpProvider().createBase(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_BASE_IPC_CHANNELS.update,
    async (_e: IpcMainInvokeEvent, input: KnowledgeBaseUpdateInput) => {
      try {
        requireAuth();
        if (isMockMode()) {
          const facade = mockFacade();
          facade.ensureSeeded();
          const entity = facade.mutateEntity({
            kind: "base",
            entityId: input.knowledgeBaseId,
            patch: { title: input.name },
          });
          return snapshotFromMockEntity(entity);
        }
        return await getKnowledgeHttpProvider().updateBase(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_BASE_IPC_CHANNELS.delete,
    async (_e: IpcMainInvokeEvent, input: KnowledgeBaseDeleteInput) => {
      try {
        requireAuth();
        if (isMockMode()) {
          const facade = mockFacade();
          facade.ensureSeeded();
          facade.mutateEntity({
            kind: "base",
            entityId: input.knowledgeBaseId,
            patch: { title: input.knowledgeBaseId, deleted: true },
          });
          return;
        }
        await getKnowledgeHttpProvider().deleteBase(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_BASE_IPC_CHANNELS.listFiles,
    async (_e: IpcMainInvokeEvent, input: KnowledgeBaseListFilesInput) => {
      try {
        requireAuth();
        if (isMockMode()) {
          const facade = mockFacade();
          facade.ensureSeeded();
          const items = facade.listEntities({ kind: "document" }).map((doc) => ({
            id: doc.id,
            knowledgeBaseId: input.knowledgeBaseId,
            fileName: doc.title ?? doc.id,
            status: "active" as const,
          }));
          return { items, total: items.length, page: 1, pageSize: items.length };
        }
        return await getKnowledgeHttpProvider().listBaseFiles(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );
}
