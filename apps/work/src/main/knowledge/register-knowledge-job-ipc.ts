/**
 * Register `knowledge-job:*` IPC handlers. Keep handlers thin — logic lives in the coordinator.
 */

import { BrowserWindow, type IpcMain, type IpcMainInvokeEvent } from "electron";
import { getActiveProfileNameSync } from "../utils";
import { readStoredSessionSync } from "../auth/token-store";
import {
  KNOWLEDGE_JOB_IPC_CHANNELS,
  type KnowledgeJobCommandInput,
  type KnowledgeJobCreateDraftInput,
  type KnowledgeJobSnapshot,
} from "../../shared/knowledge/knowledge-job-ipc";
import {
  configureKnowledgeUploadJobCoordinator,
  deriveKnowledgeJobPartition,
  getKnowledgeUploadJobCoordinator,
  isKnowledgeJobSnapshotVisibleToPartition,
  type KnowledgeJobPartition,
} from "./knowledge-upload-job-coordinator";

export type RegisterKnowledgeJobIpcOptions = {
  getMainWindow?: () => BrowserWindow | null;
};

function resolveMainPartition(): KnowledgeJobPartition {
  const session = readStoredSessionSync();
  const authSubject = session?.user?.id?.trim();
  if (!authSubject) {
    throw new Error("KNOWLEDGE_JOB_AUTH_REQUIRED");
  }
  return deriveKnowledgeJobPartition({
    workProfileId: getActiveProfileNameSync(),
    authSubject,
    tenantId: session?.user?.tenantId,
  });
}

function ensureCoordinator() {
  return configureKnowledgeUploadJobCoordinator({
    getPartition: resolveMainPartition,
    isProviderAvailable: () => false,
  });
}

function resolveMainPartitionOrNull(): KnowledgeJobPartition | null {
  try {
    return resolveMainPartition();
  } catch {
    return null;
  }
}

function broadcastSnapshot(snapshot: KnowledgeJobSnapshot): void {
  // AC-08: never push foreign-partition (or unauthenticated) Job snapshots.
  if (
    !isKnowledgeJobSnapshotVisibleToPartition(
      snapshot,
      resolveMainPartitionOrNull(),
    )
  ) {
    return;
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send(
        KNOWLEDGE_JOB_IPC_CHANNELS.snapshotChanged,
        snapshot,
      );
    } catch {
      // Window may be closing mid-send.
    }
  }
}

function sanitizeIpcError(err: unknown): Error {
  if (err instanceof Error) {
    const code = err.message.split(/\s/)[0] ?? "KNOWLEDGE_JOB_ERROR";
    if (/^[A-Z][A-Z0-9_]+$/.test(code)) {
      return new Error(code);
    }
  }
  return new Error("KNOWLEDGE_JOB_ERROR");
}

/** Register `knowledge-job:*` IPC handlers against the given ipcMain. */
export function registerKnowledgeJobIpcHandlers(
  ipcMain: IpcMain,
  _options: RegisterKnowledgeJobIpcOptions = {},
): void {
  const coordinator = ensureCoordinator();
  coordinator.recoverOnStart();
  coordinator.subscribe(broadcastSnapshot);

  ipcMain.handle(
    KNOWLEDGE_JOB_IPC_CHANNELS.createDraft,
    (_e: IpcMainInvokeEvent, input?: KnowledgeJobCreateDraftInput) => {
      try {
        return getKnowledgeUploadJobCoordinator().createDraft(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_JOB_IPC_CHANNELS.getSnapshot,
    (_e: IpcMainInvokeEvent, jobId: string) => {
      try {
        return getKnowledgeUploadJobCoordinator().getSnapshot(jobId);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_JOB_IPC_CHANNELS.listSnapshots,
    () => {
      try {
        return getKnowledgeUploadJobCoordinator().listSnapshots();
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_JOB_IPC_CHANNELS.cancel,
    (_e: IpcMainInvokeEvent, input: KnowledgeJobCommandInput) => {
      try {
        const c = getKnowledgeUploadJobCoordinator();
        return c.cancel(input.jobId, {
          partition: resolveMainPartition(),
          commandId: input.commandId,
        });
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_JOB_IPC_CHANNELS.retry,
    (_e: IpcMainInvokeEvent, input: KnowledgeJobCommandInput) => {
      try {
        const c = getKnowledgeUploadJobCoordinator();
        return c.retry(input.jobId, {
          partition: resolveMainPartition(),
          commandId: input.commandId,
        });
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(KNOWLEDGE_JOB_IPC_CHANNELS.getCapability, () => {
    try {
      return getKnowledgeUploadJobCoordinator().getCapabilitySnapshot();
    } catch (err) {
      throw sanitizeIpcError(err);
    }
  });
}
