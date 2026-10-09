/**
 * Register `knowledge-job:*` IPC handlers. Keep handlers thin — logic lives in the coordinator.
 */

import { BrowserWindow, type IpcMain, type IpcMainInvokeEvent } from "electron";
import { getActiveProfileNameSync } from "../utils";
import { readStoredSessionSync } from "../auth/token-store";
import {
  KNOWLEDGE_JOB_IPC_CHANNELS,
  MAX_KNOWLEDGE_BATCH_FILES,
  type KnowledgeActiveDataMode,
  type KnowledgeJobCommandInput,
  type KnowledgeJobCreateDraftInput,
  type KnowledgeJobDeleteInput,
  type KnowledgeJobDropPathsInput,
  type KnowledgeJobPickAndUploadInput,
  type KnowledgeJobRefreshInput,
  type KnowledgeJobSnapshot,
  type KnowledgeJobRemoved,
} from "../../shared/knowledge/knowledge-job-ipc";
import {
  configureKnowledgeUploadJobCoordinator,
  deriveKnowledgeJobPartition,
  getKnowledgeUploadJobCoordinator,
  isKnowledgeJobSnapshotVisibleToPartition,
  partitionsEqual,
  type KnowledgeJobPartition,
} from "./knowledge-upload-job-coordinator";
import { getKnowledgeModeSnapshot } from "./knowledge-mode-controller";
import {
  ensureKnowledgeCapability,
  isKnowledgeProviderAvailable,
} from "./knowledge-capability";
import {
  hydrateTokenStore,
  subscribeStoredSessionChanges,
} from "../auth/token-store";
import {
  invalidateKnowledgeCapability,
  refreshKnowledgeCapability,
} from "./knowledge-capability";
import { selectFilePaths } from "../files/file-service";
import { importOnePath } from "../files/file-import-service";

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

/** Mode Controller must already be latched (register mode IPC before Job IPC). */
function resolveDataMode(): KnowledgeActiveDataMode {
  return getKnowledgeModeSnapshot().dataMode;
}

function ensureCoordinator() {
  return configureKnowledgeUploadJobCoordinator({
    getPartition: resolveMainPartition,
    isProviderAvailable: isKnowledgeProviderAvailable,
    getDataMode: resolveDataMode,
    selectFiles: () => selectFilePaths({ multiple: true }),
    importFile: importOnePath,
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

function broadcastRemoved(
  removed: KnowledgeJobRemoved,
  partition: KnowledgeJobPartition,
): void {
  if (!sameIdentity(partition, resolveMainPartitionOrNull())) return;
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send(KNOWLEDGE_JOB_IPC_CHANNELS.jobRemoved, removed);
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
  coordinator.subscribe(broadcastSnapshot);

  ipcMain.handle(
    KNOWLEDGE_JOB_IPC_CHANNELS.pickAndUpload,
    async (_e: IpcMainInvokeEvent, input: KnowledgeJobPickAndUploadInput) => {
      try {
        const coordinator = getKnowledgeUploadJobCoordinator();
        const partition = resolveMainPartition();
        const epoch = coordinator.getIdentityEpoch();
        await ensureKnowledgeCapability();
        if (
          coordinator !== getKnowledgeUploadJobCoordinator() ||
          epoch !== coordinator.getIdentityEpoch() ||
          !sameIdentity(partition, resolveMainPartitionOrNull())
        ) {
          throw new Error("KNOWLEDGE_JOB_PARTITION_DENIED");
        }
        return await coordinator.pickAndUpload(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_JOB_IPC_CHANNELS.dropAndUpload,
    async (_e: IpcMainInvokeEvent, input: KnowledgeJobDropPathsInput) => {
      try {
        if (
          !Array.isArray(input?.paths) ||
          !input.paths.length ||
          input.paths.length > MAX_KNOWLEDGE_BATCH_FILES ||
          input.paths.some((path) => typeof path !== "string")
        )
          throw new Error("KNOWLEDGE_JOB_FILE_INVALID");
        const coordinator = getKnowledgeUploadJobCoordinator();
        const partition = resolveMainPartition();
        const epoch = coordinator.getIdentityEpoch();
        const mode = resolveDataMode();
        const capability = await ensureKnowledgeCapability();
        if (
          coordinator !== getKnowledgeUploadJobCoordinator() ||
          epoch !== coordinator.getIdentityEpoch() ||
          mode !== resolveDataMode() ||
          !sameIdentity(partition, resolveMainPartitionOrNull())
        )
          throw new Error("KNOWLEDGE_JOB_PARTITION_DENIED");
        if (mode === "provider" && !capability.available)
          throw new Error(
            capability.status === "auth_required"
              ? "KNOWLEDGE_JOB_AUTH_REQUIRED"
              : "PROVIDER_UNAVAILABLE",
          );
        return await coordinator.dropAndUpload(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

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

  ipcMain.handle(KNOWLEDGE_JOB_IPC_CHANNELS.listSnapshots, () => {
    try {
      return getKnowledgeUploadJobCoordinator().listSnapshots();
    } catch (err) {
      throw sanitizeIpcError(err);
    }
  });

  ipcMain.handle(
    KNOWLEDGE_JOB_IPC_CHANNELS.refreshStatus,
    async (_e: IpcMainInvokeEvent, input: KnowledgeJobRefreshInput) => {
      try {
        const coordinator = getKnowledgeUploadJobCoordinator();
        const partition = resolveMainPartition();
        const epoch = coordinator.getIdentityEpoch();
        const mode = resolveDataMode();
        const assertCurrent = (): void => {
          if (
            coordinator !== getKnowledgeUploadJobCoordinator() ||
            epoch !== coordinator.getIdentityEpoch() ||
            mode !== resolveDataMode() ||
            !sameIdentity(partition, resolveMainPartitionOrNull())
          ) {
            throw new Error("KNOWLEDGE_JOB_PARTITION_DENIED");
          }
        };
        if (mode === "provider") {
          const capability = await ensureKnowledgeCapability();
          assertCurrent();
          if (!capability.available) {
            throw new Error(
              capability.status === "auth_required"
                ? "KNOWLEDGE_JOB_AUTH_REQUIRED"
                : "PROVIDER_UNAVAILABLE",
            );
          }
        }
        const snapshots = await coordinator.refreshStatus(input);
        assertCurrent();
        return snapshots;
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
    KNOWLEDGE_JOB_IPC_CHANNELS.deleteCancelled,
    (_e: IpcMainInvokeEvent, input: KnowledgeJobDeleteInput) => {
      try {
        const partition = resolveMainPartition();
        const removed = getKnowledgeUploadJobCoordinator().deleteCancelled(
          input,
          { partition },
        );
        broadcastRemoved(removed, partition);
        return removed;
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

  ipcMain.handle(KNOWLEDGE_JOB_IPC_CHANNELS.getCapability, async () => {
    try {
      const capability = await ensureKnowledgeCapability();
      if (capability.available)
        getKnowledgeUploadJobCoordinator().recoverOnStart();
      return capability;
    } catch (err) {
      throw sanitizeIpcError(err);
    }
  });
}

/**
 * After `app.ready` + token hydrate: probe 4530 with the LoginScreen JWT,
 * then recover non-terminal FileJobs. Do not run this during IPC register —
 * safeStorage/session is not readable before ready.
 */
let observedPartition: KnowledgeJobPartition | null = null;
let recoveryEpoch = 0;
let unsubscribeSession: (() => void) | undefined;

function sameIdentity(
  a: KnowledgeJobPartition | null,
  b: KnowledgeJobPartition | null,
): boolean {
  return a === null || b === null ? a === b : partitionsEqual(a, b);
}

/** Called before the active profile changes its state.db connection. */
export function pauseKnowledgeJobsForProfileChange(): void {
  recoveryEpoch++;
  getKnowledgeUploadJobCoordinator().pauseForIdentityChange();
  invalidateKnowledgeCapability();
  observedPartition = null;
}

export function resumeKnowledgeJobsForActiveProfile(): void {
  const partition = resolveMainPartitionOrNull();
  if (!sameIdentity(observedPartition, partition)) {
    getKnowledgeUploadJobCoordinator().pauseForIdentityChange();
    invalidateKnowledgeCapability();
  }
  observedPartition = partition;
  const epoch = ++recoveryEpoch;
  void refreshKnowledgeCapability()
    .then(() => {
      if (
        epoch === recoveryEpoch &&
        sameIdentity(partition, resolveMainPartitionOrNull())
      ) {
        getKnowledgeUploadJobCoordinator().recoverOnStart();
      }
    })
    .catch(() => {
      /* Capability is fail-closed; a later request can re-probe. */
    });
}

export function startKnowledgeProviderAfterAuth(): void {
  unsubscribeSession?.();
  unsubscribeSession = subscribeStoredSessionChanges(
    resumeKnowledgeJobsForActiveProfile,
  );
  void hydrateTokenStore()
    .then(resumeKnowledgeJobsForActiveProfile)
    .catch(() => {
      /* Capability is fail-closed until token hydration succeeds. */
    });
}
