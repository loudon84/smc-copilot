/**
 * v8.2 — Chat workspace service (domain API over store).
 */

import type {
  ChatWorkspaceCloseRunInput,
  ChatWorkspaceMigrateV1Input,
  ChatWorkspaceOpenInput,
  ChatWorkspaceOpenSessionInput,
  ChatWorkspaceOpenSessionResult,
  ChatWorkspacePatchRunInput,
  ChatWorkspaceReorderInput,
  ChatWorkspaceRunRow,
  ChatWorkspaceSetActiveInput,
  ChatWorkspaceSnapshot,
} from "../../shared/chat-workspace/chat-workspace-contract";
import { DEFAULT_CHAT_WORKSPACE_ID } from "../../shared/chat-workspace/chat-workspace-contract";
import * as store from "./chat-workspace-store";

export type WorkspaceChangedListener = (
  snapshot: ChatWorkspaceSnapshot,
) => void;

const listeners = new Set<WorkspaceChangedListener>();

export function onChatWorkspaceChanged(
  listener: WorkspaceChangedListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChanged(workspaceId: string): ChatWorkspaceSnapshot {
  const snapshot = store.getSnapshot(workspaceId);
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (err) {
      console.warn("[chat-workspace] listener error:", err);
    }
  }
  return snapshot;
}

export function getSnapshot(
  workspaceId: string = DEFAULT_CHAT_WORKSPACE_ID,
): ChatWorkspaceSnapshot {
  return store.getSnapshot(workspaceId);
}

export function listDrafts(
  workspaceId: string = DEFAULT_CHAT_WORKSPACE_ID,
): ChatWorkspaceRunRow[] {
  return store.listDraftRuns(workspaceId);
}

// @lat: [[domain/chat#Workspace persistence]]
export function openRun(input: ChatWorkspaceOpenInput): ChatWorkspaceSnapshot {
  const workspaceId = input.workspaceId || DEFAULT_CHAT_WORKSPACE_ID;
  const existing = store.getRun(input.runId);
  const now = Date.now();
  if (existing && !existing.closedAt) {
    store.updateRunFields(input.runId, {
      profileId: input.profileId || existing.profileId,
      sessionId:
        input.sessionId !== undefined ? input.sessionId : existing.sessionId,
      title: input.title || existing.title,
      titleSource: input.titleSource || existing.titleSource,
      mode: input.mode || existing.mode,
      expertId: input.expertId ?? existing.expertId,
      expertName: input.expertName ?? existing.expertName,
      teamId: input.teamId ?? existing.teamId,
      teamName: input.teamName ?? existing.teamName,
      skillName: input.skillName ?? existing.skillName,
      skillDisplayName: input.skillDisplayName ?? existing.skillDisplayName,
      workMode: input.workMode || existing.workMode,
      permissionMode: input.permissionMode || existing.permissionMode,
      modelId: input.modelId ?? existing.modelId,
    });
  } else {
    const row: ChatWorkspaceRunRow = {
      runId: input.runId,
      workspaceId,
      profileId: input.profileId || "default",
      sessionId: input.sessionId ?? null,
      position: store.nextPosition(workspaceId),
      title: input.title || "New Chat",
      titleSource: input.titleSource || (input.title ? "user" : "placeholder"),
      mode: input.mode || "default",
      expertId: input.expertId ?? null,
      expertName: input.expertName ?? null,
      teamId: input.teamId ?? null,
      teamName: input.teamName ?? null,
      skillName: input.skillName ?? null,
      skillDisplayName: input.skillDisplayName ?? null,
      workMode: input.workMode || "ask",
      permissionMode: input.permissionMode || "default",
      modelId: input.modelId ?? null,
      runState: "idle",
      draft: null,
      filesVisible: false,
      previewFileId: null,
      previewMaximized: false,
      createdAt: now,
      updatedAt: now,
      closedAt: null,
    };
    store.insertRun(row);
  }
  if (input.activate !== false) {
    store.setActiveRunId(workspaceId, input.runId);
  }
  return emitChanged(workspaceId);
}

// @lat: [[domain/chat#Draft versus session runs]]
export function openSession(
  input: ChatWorkspaceOpenSessionInput,
): { result: ChatWorkspaceOpenSessionResult; snapshot: ChatWorkspaceSnapshot } {
  const workspaceId = input.workspaceId || DEFAULT_CHAT_WORKSPACE_ID;
  if (!input.forceNewTab) {
    const linked = store.findRunBySession(
      input.profileId,
      input.sessionId,
      workspaceId,
    );
    if (linked) {
      store.setActiveRunId(workspaceId, linked.runId);
      return {
        result: { runId: linked.runId, created: false, workspaceId },
        snapshot: emitChanged(workspaceId),
      };
    }
  }
  const runId = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const snapshot = openRun({
    workspaceId,
    runId,
    profileId: input.profileId,
    sessionId: input.sessionId,
    title: input.title || "New Chat",
    titleSource: input.title ? "session" : "placeholder",
    activate: true,
  });
  return {
    result: { runId, created: true, workspaceId },
    snapshot,
  };
}

export function patchRun(
  input: ChatWorkspacePatchRunInput,
): ChatWorkspaceSnapshot {
  const workspaceId =
    input.workspaceId ||
    store.getRun(input.runId)?.workspaceId ||
    DEFAULT_CHAT_WORKSPACE_ID;
  const patch = input.patch;
  store.updateRunFields(input.runId, {
    ...(patch.profileId !== undefined ? { profileId: patch.profileId } : {}),
    ...(patch.sessionId !== undefined ? { sessionId: patch.sessionId } : {}),
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.titleSource !== undefined
      ? { titleSource: patch.titleSource }
      : {}),
    ...(patch.mode !== undefined ? { mode: patch.mode } : {}),
    ...(patch.expertId !== undefined ? { expertId: patch.expertId } : {}),
    ...(patch.expertName !== undefined ? { expertName: patch.expertName } : {}),
    ...(patch.teamId !== undefined ? { teamId: patch.teamId } : {}),
    ...(patch.teamName !== undefined ? { teamName: patch.teamName } : {}),
    ...(patch.skillName !== undefined ? { skillName: patch.skillName } : {}),
    ...(patch.skillDisplayName !== undefined
      ? { skillDisplayName: patch.skillDisplayName }
      : {}),
    ...(patch.workMode !== undefined ? { workMode: patch.workMode } : {}),
    ...(patch.permissionMode !== undefined
      ? { permissionMode: patch.permissionMode }
      : {}),
    ...(patch.modelId !== undefined ? { modelId: patch.modelId } : {}),
    ...(patch.runState !== undefined ? { runState: patch.runState } : {}),
    ...(patch.draft !== undefined ? { draft: patch.draft } : {}),
    ...(patch.filesVisible !== undefined
      ? { filesVisible: patch.filesVisible }
      : {}),
    ...(patch.previewFileId !== undefined
      ? { previewFileId: patch.previewFileId }
      : {}),
    ...(patch.previewMaximized !== undefined
      ? { previewMaximized: patch.previewMaximized }
      : {}),
    ...(patch.position !== undefined ? { position: patch.position } : {}),
  });
  return emitChanged(workspaceId);
}

export function closeRun(
  input: ChatWorkspaceCloseRunInput,
): ChatWorkspaceSnapshot {
  const workspaceId =
    input.workspaceId ||
    store.getRun(input.runId)?.workspaceId ||
    DEFAULT_CHAT_WORKSPACE_ID;
  store.closeRun(input.runId);
  const snaps = store.getSnapshot(workspaceId);
  if (snaps.activeRunId === input.runId) {
    const next = snaps.runs[snaps.runs.length - 1]?.runId ?? null;
    store.setActiveRunId(workspaceId, next);
  }
  return emitChanged(workspaceId);
}

export function setActive(
  input: ChatWorkspaceSetActiveInput,
): ChatWorkspaceSnapshot {
  const workspaceId = input.workspaceId || DEFAULT_CHAT_WORKSPACE_ID;
  store.setActiveRunId(workspaceId, input.runId);
  return emitChanged(workspaceId);
}

export function reorder(
  input: ChatWorkspaceReorderInput,
): ChatWorkspaceSnapshot {
  const workspaceId = input.workspaceId || DEFAULT_CHAT_WORKSPACE_ID;
  store.reorderRuns(workspaceId, input.runIds);
  return emitChanged(workspaceId);
}

/**
 * Bind Hermes sessionId onto an existing workspace run (draft → session).
 * Called from chat-runtime when session.started fires.
 */
// @lat: [[domain/chat#Draft versus session runs]]
export function bindSessionToRun(
  runId: string,
  sessionId: string,
  title?: string,
): ChatWorkspaceSnapshot | null {
  const existing = store.getRun(runId);
  if (!existing || existing.closedAt) return null;
  const fields: Partial<ChatWorkspaceRunRow> = {
    sessionId,
  };
  if (title && existing.titleSource !== "user") {
    fields.title = title.slice(0, 40);
    fields.titleSource = "session";
  }
  store.updateRunFields(runId, fields);
  return emitChanged(existing.workspaceId);
}

// @lat: [[domain/chat#Workspace persistence]]
export function migrateFromV1(
  input: ChatWorkspaceMigrateV1Input,
): ChatWorkspaceSnapshot {
  const workspaceId = input.workspaceId || DEFAULT_CHAT_WORKSPACE_ID;
  const marker = store.getMeta("chat-workspace-migration-v2");
  if (marker === "done") {
    return store.getSnapshot(workspaceId);
  }
  if (store.countOpenRuns(workspaceId) > 0) {
    store.setMeta("chat-workspace-migration-v2", "done");
    return store.getSnapshot(workspaceId);
  }
  const sorted = [...input.runs].sort(
    (a, b) => a.createdOrder - b.createdOrder,
  );
  sorted.forEach((row, index) => {
    const wasBusy =
      row.runState === "creating" ||
      row.runState === "streaming" ||
      row.runState === "waiting_approval" ||
      row.runState === "waiting_clarify";
    store.insertRun({
      runId: row.runId,
      workspaceId,
      profileId: row.profileId || "default",
      sessionId: row.sessionId,
      position: index,
      title: row.title || "New Chat",
      titleSource: row.titleSource || "placeholder",
      mode: row.mode || "default",
      expertId: row.expertId ?? null,
      expertName: row.expertName ?? null,
      teamId: row.teamId ?? null,
      teamName: row.teamName ?? null,
      skillName: row.skillName ?? null,
      skillDisplayName: row.skillDisplayName ?? null,
      workMode: row.workMode || "ask",
      permissionMode: row.permissionMode || "default",
      modelId: row.selectedModelId ?? null,
      runState: wasBusy || row.runState === "interrupted" ? "interrupted" : "idle",
      draft: row.draft ?? null,
      filesVisible: row.sessionFilesVisible ?? false,
      previewFileId: row.previewFileId ?? null,
      previewMaximized: row.previewMaximized ?? false,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      closedAt: null,
    });
  });
  if (input.activeRunId) {
    store.setActiveRunId(workspaceId, input.activeRunId);
  } else if (sorted.length > 0) {
    store.setActiveRunId(workspaceId, sorted[sorted.length - 1].runId);
  }
  store.setMeta("chat-workspace-migration-v2", "done");
  return emitChanged(workspaceId);
}

export function isMigrationDone(): boolean {
  return store.getMeta("chat-workspace-migration-v2") === "done";
}
