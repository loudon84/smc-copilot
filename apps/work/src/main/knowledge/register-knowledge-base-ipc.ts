/**
 * Register typed `knowledge-base:*` IPC. Delete is DELETE, never patch.deleted.
 */

import { BrowserWindow, type IpcMain, type IpcMainInvokeEvent } from "electron";
import { readFile } from "fs/promises";
import {
  KNOWLEDGE_BASE_IPC_CHANNELS,
  type KnowledgeActivateFileVersionInput,
  type KnowledgeAddFileVersionInput,
  type KnowledgeBaseCreateInput,
  type KnowledgeBaseDeleteInput,
  type KnowledgeBaseFileSnapshot,
  type KnowledgeBaseGetInput,
  type KnowledgeBaseListFilesInput,
  type KnowledgeBaseListInput,
  type KnowledgeBaseUpdateInput,
  type KnowledgeBuildIdInput,
  type KnowledgeBuildJobSnapshot,
  type KnowledgeFileIdInput,
  type KnowledgeResolveDocumentPreviewInput,
  type KnowledgeStartBuildInput,
  type KnowledgeUpdateBuildProfileInput,
} from "../../shared/knowledge/knowledge-base-ipc";
import { KnowledgeFacadeError } from "../../shared/knowledge/knowledge-errors";
import { getKnowledgeModeSnapshot } from "./knowledge-mode-controller";
import { getKnowledgeHttpProvider } from "./knowledge-http-provider";
import { KnowledgeProviderFacade } from "./knowledge-provider-facade";
import { deriveKnowledgeJobPartition } from "./knowledge-upload-job-coordinator";
import { getActiveProfileNameSync } from "../utils";
import { readStoredSessionSync } from "../auth/token-store";
import { getManagedFile } from "../files/file-association-store";
import { KnowledgeBuildPoller } from "./knowledge-build-poller";
import { resolveDocumentPreview } from "./knowledge-preview-resolve";

function broadcastBuildSnapshot(snapshot: KnowledgeBuildJobSnapshot): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send(KNOWLEDGE_BASE_IPC_CHANNELS.buildChanged, snapshot);
    } catch {
      // Window may be closing mid-send.
    }
  }
}

const buildPoller = new KnowledgeBuildPoller(
  (buildId) => getKnowledgeHttpProvider().getBuild({ buildId }),
  broadcastBuildSnapshot,
);

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

  const mockFile = (
    sourceFileId: string,
    knowledgeBaseId = "mock-base",
  ): KnowledgeBaseFileSnapshot => ({
    id: sourceFileId,
    knowledgeBaseId,
    fileName: sourceFileId,
    status: "active",
    activeVersionId: `${sourceFileId}-v1`,
    archivedAt: null,
  });

  ipcMain.handle(
    KNOWLEDGE_BASE_IPC_CHANNELS.getFile,
    async (_e: IpcMainInvokeEvent, input: KnowledgeFileIdInput) => {
      try {
        requireAuth();
        if (isMockMode()) return mockFile(input.sourceFileId);
        return await getKnowledgeHttpProvider().getFile(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_BASE_IPC_CHANNELS.listFileVersions,
    async (_e: IpcMainInvokeEvent, input: KnowledgeFileIdInput) => {
      try {
        requireAuth();
        if (isMockMode()) {
          return [
            {
              id: `${input.sourceFileId}-v1`,
              sourceFileId: input.sourceFileId,
              versionNo: 1,
              parseStatus: "active" as const,
            },
          ];
        }
        return await getKnowledgeHttpProvider().listFileVersions(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_BASE_IPC_CHANNELS.addFileVersion,
    async (_e: IpcMainInvokeEvent, input: KnowledgeAddFileVersionInput) => {
      try {
        requireAuth();
        if (isMockMode()) return mockFile(input.sourceFileId);
        const file = getManagedFile(
          getActiveProfileNameSync(),
          input.managedFileId,
        );
        const filePath = file?.managedPath || file?.originalPath;
        if (!file || !filePath) throw new Error("KNOWLEDGE_JOB_FILE_MISSING");
        const bytes = await readFile(filePath);
        const accepted = await getKnowledgeHttpProvider().addFileVersion({
          sourceFileId: input.sourceFileId,
          fileName: file.name,
          bytes,
          mimeType: file.mime,
        });
        return await getKnowledgeHttpProvider().getFile({
          sourceFileId: accepted.sourceFileId,
        });
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_BASE_IPC_CHANNELS.activateFileVersion,
    async (_e: IpcMainInvokeEvent, input: KnowledgeActivateFileVersionInput) => {
      try {
        requireAuth();
        if (isMockMode()) {
          return {
            ...mockFile(input.sourceFileId),
            activeVersionId: input.versionId,
          };
        }
        return await getKnowledgeHttpProvider().activateFileVersion(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_BASE_IPC_CHANNELS.archiveFile,
    async (_e: IpcMainInvokeEvent, input: KnowledgeFileIdInput) => {
      try {
        requireAuth();
        if (isMockMode()) {
          return { ...mockFile(input.sourceFileId), archivedAt: new Date().toISOString() };
        }
        return await getKnowledgeHttpProvider().archiveFile(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_BASE_IPC_CHANNELS.unarchiveFile,
    async (_e: IpcMainInvokeEvent, input: KnowledgeFileIdInput) => {
      try {
        requireAuth();
        if (isMockMode()) return mockFile(input.sourceFileId);
        return await getKnowledgeHttpProvider().unarchiveFile(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_BASE_IPC_CHANNELS.reparseFile,
    async (_e: IpcMainInvokeEvent, input: KnowledgeFileIdInput) => {
      try {
        requireAuth();
        if (isMockMode()) return mockFile(input.sourceFileId);
        return await getKnowledgeHttpProvider().reparseFile(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_BASE_IPC_CHANNELS.deleteFile,
    async (_e: IpcMainInvokeEvent, input: KnowledgeFileIdInput) => {
      try {
        requireAuth();
        if (isMockMode()) return;
        await getKnowledgeHttpProvider().deleteFile(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_BASE_IPC_CHANNELS.resolveDocumentPreview,
    async (
      _e: IpcMainInvokeEvent,
      input: KnowledgeResolveDocumentPreviewInput,
    ) => {
      try {
        requireAuth();
        if (isMockMode()) {
          throw new Error("KNOWLEDGE_UNAVAILABLE");
        }
        return await resolveDocumentPreview({
          sourceFileId: input.sourceFileId,
          activeVersionId: input.activeVersionId,
          forceRefresh: input.forceRefresh,
          fileName: input.fileName,
          mimeType: input.mimeType,
          workProfileId: getActiveProfileNameSync(),
        });
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_BASE_IPC_CHANNELS.listIndexes,
    async (_e: IpcMainInvokeEvent, input: KnowledgeBaseGetInput) => {
      try {
        requireAuth();
        if (isMockMode()) return [];
        return await getKnowledgeHttpProvider().listIndexes(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_BASE_IPC_CHANNELS.getBuildProfile,
    async (_e: IpcMainInvokeEvent, input: KnowledgeBaseGetInput) => {
      try {
        requireAuth();
        if (isMockMode()) {
          return {
            activeBuildProfileId: "mock-profile",
            profileId: "mock-profile",
            profileName: "Mock profile",
          };
        }
        return await getKnowledgeHttpProvider().getBuildProfile(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_BASE_IPC_CHANNELS.updateBuildProfile,
    async (_e: IpcMainInvokeEvent, input: KnowledgeUpdateBuildProfileInput) => {
      try {
        requireAuth();
        if (isMockMode()) {
          return {
            activeBuildProfileId: input.buildProfileId,
            profileId: input.buildProfileId,
            profileName: input.buildProfileId,
          };
        }
        return await getKnowledgeHttpProvider().updateBuildProfile(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_BASE_IPC_CHANNELS.startBuild,
    async (_e: IpcMainInvokeEvent, input: KnowledgeStartBuildInput) => {
      try {
        requireAuth();
        if (isMockMode()) {
          return {
            id: `build-${input.knowledgeBaseId}`,
            status: "completed" as const,
            progress: 100,
            knowledgeBaseId: input.knowledgeBaseId,
          };
        }
        const snapshot = await getKnowledgeHttpProvider().startBuild(input);
        buildPoller.watch(snapshot.id);
        return snapshot;
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_BASE_IPC_CHANNELS.getBuild,
    async (_e: IpcMainInvokeEvent, input: KnowledgeBuildIdInput) => {
      try {
        requireAuth();
        if (isMockMode()) {
          return { id: input.buildId, status: "completed" as const, progress: 100 };
        }
        return await getKnowledgeHttpProvider().getBuild(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_BASE_IPC_CHANNELS.retryBuild,
    async (_e: IpcMainInvokeEvent, input: KnowledgeBuildIdInput) => {
      try {
        requireAuth();
        if (isMockMode()) {
          return { id: input.buildId, status: "queued" as const, progress: 0 };
        }
        const snapshot = await getKnowledgeHttpProvider().retryBuild(input);
        buildPoller.watch(snapshot.id);
        return snapshot;
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_BASE_IPC_CHANNELS.watchBuild,
    async (_e: IpcMainInvokeEvent, input: KnowledgeBuildIdInput) => {
      try {
        requireAuth();
        if (isMockMode()) {
          return { id: input.buildId, status: "completed" as const, progress: 100 };
        }
        const snapshot = await getKnowledgeHttpProvider().getBuild(input);
        buildPoller.watch(input.buildId);
        return snapshot;
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_BASE_IPC_CHANNELS.unwatchBuild,
    async (_e: IpcMainInvokeEvent, input?: KnowledgeBuildIdInput) => {
      try {
        requireAuth();
        buildPoller.unwatch(input?.buildId);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );
}
