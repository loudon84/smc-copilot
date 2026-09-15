/**
 * Register sanitized `knowledge-mode:*` / `knowledge-facade:*` IPC handlers.
 * Keep handlers thin — Mode Controller and Provider Facade own the logic.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { getActiveProfileNameSync } from "../utils";
import { readStoredSessionSync } from "../auth/token-store";
import {
  KNOWLEDGE_FACADE_IPC_CHANNELS,
  KNOWLEDGE_MODE_IPC_CHANNELS,
  type KnowledgeFacadeGetInput,
  type KnowledgeFacadeListInput,
  type KnowledgeFacadeMutateInput,
  type KnowledgeJobPartition,
  type KnowledgeModeSnapshot,
} from "../../shared/knowledge/knowledge-job-ipc";
import {
  bootstrapKnowledgeMode,
  getKnowledgeModeSnapshot,
} from "./knowledge-mode-controller";
import { KnowledgeProviderFacade } from "./knowledge-provider-facade";
import { deriveKnowledgeJobPartition } from "./knowledge-upload-job-coordinator";
import { listNonTerminalJobs } from "./knowledge-upload-job-store";

let facadeSingleton: KnowledgeProviderFacade | null = null;

function sanitizeIpcError(err: unknown): Error {
  if (err instanceof Error) {
    const code = err.message.split(/\s/)[0] ?? "KNOWLEDGE_MODE_ERROR";
    if (/^[A-Z][A-Z0-9_]+$/.test(code)) {
      return new Error(code);
    }
  }
  return new Error("KNOWLEDGE_MODE_ERROR");
}

function resolveMainPartition(): KnowledgeJobPartition {
  const session = readStoredSessionSync();
  const authSubject = session?.user?.id?.trim();
  if (!authSubject) {
    throw new Error("KNOWLEDGE_FACADE_AUTH_REQUIRED");
  }
  return deriveKnowledgeJobPartition({
    workProfileId: getActiveProfileNameSync(),
    authSubject,
    tenantId: session?.user?.tenantId,
  });
}

/** Ensure mode is latched; default provider when undeclared. Never expose tokens. */
function ensureModeSnapshot(): KnowledgeModeSnapshot {
  try {
    return getKnowledgeModeSnapshot();
  } catch {
    try {
      return bootstrapKnowledgeMode({
        listNonTerminalJobs: () =>
          listNonTerminalJobs().map((job) => ({
            jobId: job.jobId,
            dataMode: job.dataMode,
          })),
      });
    } catch (err) {
      if (err instanceof Error && err.message === "KNOWLEDGE_MODE_IMMUTABLE") {
        return getKnowledgeModeSnapshot();
      }
      // Cross-mode non-terminal conflict and dual-declaration rejects must surface.
      if (
        err instanceof Error &&
        /^KNOWLEDGE_MODE_[A-Z0-9_]+$/.test(err.message.split(/\s/)[0] ?? "")
      ) {
        throw err;
      }
      return {
        dataMode: "provider",
        allowSyntheticData: false,
        configSource: "default",
      };
    }
  }
}

function getFacade(): KnowledgeProviderFacade {
  if (!facadeSingleton) {
    facadeSingleton = new KnowledgeProviderFacade({
      getMode: ensureModeSnapshot,
      getPartition: resolveMainPartition,
    });
  }
  return facadeSingleton;
}

/** Test-only: drop the registrar-owned facade singleton. */
export function resetKnowledgeModeIpcFacadeForTests(): void {
  facadeSingleton = null;
}

/** Register mode + facade IPC against the given ipcMain. */
export function registerKnowledgeModeIpcHandlers(ipcMain: IpcMain): void {
  // Latch effective mode once at handler registration (Main start path).
  ensureModeSnapshot();

  ipcMain.handle(KNOWLEDGE_MODE_IPC_CHANNELS.getSnapshot, () => {
    try {
      const snap = ensureModeSnapshot();
      return {
        dataMode: snap.dataMode,
        allowSyntheticData: snap.allowSyntheticData,
        channel: snap.channel,
        configSource: snap.configSource,
      } satisfies KnowledgeModeSnapshot;
    } catch (err) {
      throw sanitizeIpcError(err);
    }
  });

  ipcMain.handle(
    KNOWLEDGE_FACADE_IPC_CHANNELS.listEntities,
    (_e: IpcMainInvokeEvent, input: KnowledgeFacadeListInput) => {
      try {
        const facade = getFacade();
        facade.ensureSeeded();
        return facade.listEntities(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_FACADE_IPC_CHANNELS.getEntity,
    (_e: IpcMainInvokeEvent, input: KnowledgeFacadeGetInput) => {
      try {
        const facade = getFacade();
        facade.ensureSeeded();
        return facade.getEntity(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );

  ipcMain.handle(
    KNOWLEDGE_FACADE_IPC_CHANNELS.mutateEntity,
    (_e: IpcMainInvokeEvent, input: KnowledgeFacadeMutateInput) => {
      try {
        const facade = getFacade();
        facade.ensureSeeded();
        return facade.mutateEntity(input);
      } catch (err) {
        throw sanitizeIpcError(err);
      }
    },
  );
}
