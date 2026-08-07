/**
 * v8.1.1 — Durable chat queue service + IPC.
 */

import { ipcMain } from "electron";
import { randomUUID } from "crypto";
import { CHAT_RUNTIME_CHANNELS } from "../../shared/chat-runtime/chat-runtime-contract";
import type { DurableChatQueueEntry } from "../../shared/chat-runtime/chat-runtime-state";
import {
  deleteQueueEntry,
  getRun,
  listQueueEntries,
  upsertQueueEntry,
} from "./chat-runtime-store";
import { ServeChatRuntimeAdapter } from "../runtime-adapters/ServeChatRuntimeAdapter";

const autoDrainByRun = new Map<string, boolean>();

export type QueueEnqueueInput = {
  runId: string;
  profileId?: string;
  snapshotJson: string;
  position?: number;
};

export function enqueueChatMessage(
  input: QueueEnqueueInput,
): DurableChatQueueEntry {
  const profileId = input.profileId || getRun(input.runId)?.profileId || "default";
  const existing = listQueueEntries(input.runId, profileId);
  const position =
    input.position ??
    (existing.length === 0
      ? 0
      : Math.max(...existing.map((e) => e.position)) + 1);
  const entry: DurableChatQueueEntry = {
    queueId: randomUUID(),
    runId: input.runId,
    position,
    snapshotJson: input.snapshotJson,
    status: "queued",
    createdAt: Date.now(),
  };
  upsertQueueEntry(entry, profileId);
  return entry;
}

export function removeQueuedMessage(
  queueId: string,
  runId: string,
  profileId?: string,
): void {
  const pid = profileId || getRun(runId)?.profileId || "default";
  deleteQueueEntry(queueId, pid);
}

export function moveQueuedMessage(input: {
  runId: string;
  profileId?: string;
  queueId: string;
  toPosition: number;
}): DurableChatQueueEntry[] {
  const pid = input.profileId || getRun(input.runId)?.profileId || "default";
  const entries = listQueueEntries(input.runId, pid).filter(
    (e) => e.status === "queued" || e.status === "running",
  );
  const idx = entries.findIndex((e) => e.queueId === input.queueId);
  if (idx < 0) return entries;
  const [item] = entries.splice(idx, 1);
  if (!item) return entries;
  const target = Math.max(0, Math.min(input.toPosition, entries.length));
  entries.splice(target, 0, item);
  entries.forEach((e, i) => {
    upsertQueueEntry({ ...e, position: i }, pid);
  });
  return listQueueEntries(input.runId, pid);
}

export function markQueueRunning(
  queueId: string,
  runId: string,
  profileId?: string,
): void {
  const pid = profileId || getRun(runId)?.profileId || "default";
  const entry = listQueueEntries(runId, pid).find((e) => e.queueId === queueId);
  if (!entry) return;
  upsertQueueEntry({ ...entry, status: "running" }, pid);
}

export function completeQueueEntry(
  queueId: string,
  runId: string,
  status: "completed" | "failed" | "cancelled" = "completed",
  profileId?: string,
): void {
  const pid = profileId || getRun(runId)?.profileId || "default";
  if (status === "completed") {
    deleteQueueEntry(queueId, pid);
    return;
  }
  const entry = listQueueEntries(runId, pid).find((e) => e.queueId === queueId);
  if (!entry) return;
  upsertQueueEntry({ ...entry, status }, pid);
}

export function setQueueAutoDrain(runId: string, enabled: boolean): void {
  autoDrainByRun.set(runId, enabled);
}

export function getQueueAutoDrain(runId: string): boolean {
  return autoDrainByRun.get(runId) !== false;
}

export function registerChatQueueIpc(): void {
  ipcMain.handle(
    CHAT_RUNTIME_CHANNELS.queueEnqueue,
    async (_e, input: QueueEnqueueInput) => {
      if (ServeChatRuntimeAdapter.preferred()) {
        const entry = await ServeChatRuntimeAdapter.enqueue(
          input.runId,
          input.snapshotJson,
        );
        return { ok: true as const, entry };
      }
      return {
        ok: true as const,
        entry: enqueueChatMessage(input),
      };
    },
  );
  ipcMain.handle(
    CHAT_RUNTIME_CHANNELS.queueList,
    async (_e, input: { runId: string; profileId?: string }) => {
      if (ServeChatRuntimeAdapter.preferred()) {
        const entries = await ServeChatRuntimeAdapter.listQueue(input.runId);
        return {
          ok: true as const,
          entries,
          autoDrain: getQueueAutoDrain(input.runId),
        };
      }
      return {
        ok: true as const,
        entries: listQueueEntries(
          input.runId,
          input.profileId || getRun(input.runId)?.profileId || "default",
        ),
        autoDrain: getQueueAutoDrain(input.runId),
      };
    },
  );
  ipcMain.handle(
    CHAT_RUNTIME_CHANNELS.queueRemove,
    async (_e, input: { queueId: string; runId: string; profileId?: string }) => {
      if (ServeChatRuntimeAdapter.preferred()) {
        await ServeChatRuntimeAdapter.deleteQueue(input.runId, input.queueId);
        return { ok: true as const };
      }
      removeQueuedMessage(input.queueId, input.runId, input.profileId);
      return { ok: true as const };
    },
  );
  ipcMain.handle(
    CHAT_RUNTIME_CHANNELS.queueMove,
    async (_e, input: {
      runId: string;
      profileId?: string;
      queueId: string;
      toPosition: number;
    }) => {
      if (ServeChatRuntimeAdapter.preferred()) {
        await ServeChatRuntimeAdapter.patchQueue(input.runId, input.queueId, {
          position: input.toPosition,
        });
        const entries = await ServeChatRuntimeAdapter.listQueue(input.runId);
        return { ok: true as const, entries };
      }
      return {
        ok: true as const,
        entries: moveQueuedMessage(input),
      };
    },
  );
  ipcMain.handle(
    CHAT_RUNTIME_CHANNELS.queueMarkRunning,
    async (_e, input: { queueId: string; runId: string; profileId?: string }) => {
      if (ServeChatRuntimeAdapter.preferred()) {
        await ServeChatRuntimeAdapter.patchQueue(input.runId, input.queueId, {
          status: "running",
        });
        return { ok: true as const };
      }
      markQueueRunning(input.queueId, input.runId, input.profileId);
      return { ok: true as const };
    },
  );
  ipcMain.handle(
    CHAT_RUNTIME_CHANNELS.queueComplete,
    async (
      _e,
      input: {
        queueId: string;
        runId: string;
        profileId?: string;
        status?: "completed" | "failed" | "cancelled";
      },
    ) => {
      if (ServeChatRuntimeAdapter.preferred()) {
        const status = input.status || "completed";
        if (status === "completed") {
          await ServeChatRuntimeAdapter.deleteQueue(input.runId, input.queueId);
        } else {
          await ServeChatRuntimeAdapter.patchQueue(input.runId, input.queueId, {
            status,
          });
        }
        return { ok: true as const };
      }
      completeQueueEntry(
        input.queueId,
        input.runId,
        input.status || "completed",
        input.profileId,
      );
      return { ok: true as const };
    },
  );
  ipcMain.handle(
    CHAT_RUNTIME_CHANNELS.queueSetAutoDrain,
    (_e, input: { runId: string; enabled: boolean }) => {
      setQueueAutoDrain(input.runId, input.enabled);
      return { ok: true as const, autoDrain: input.enabled };
    },
  );
}
