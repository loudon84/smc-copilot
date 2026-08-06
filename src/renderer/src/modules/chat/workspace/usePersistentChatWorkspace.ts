/**
 * v8.2 — Hydrate / migrate Chat Workspace from Main-owned store.
 */

import {
  CHAT_WORKSPACE_STORAGE_KEY,
  deserializeChatWorkspace,
  type PersistedChatWorkspace,
} from "./chatWorkspacePersistence";
import { snapshotToState } from "./chatWorkspaceMappers";
import type { ChatWorkspaceState } from "./chatWorkspaceReducer";
import { DEFAULT_CHAT_WORKSPACE_ID } from "@shared/chat-workspace/chat-workspace-contract";

const MIGRATION_FLAG = "chat-workspace-migration-v2";

function hasChatWorkspaceApi(): boolean {
  return typeof window !== "undefined" && Boolean(window.chatWorkspace);
}

// @lat: [[domain/chat#Workspace persistence]]
export async function loadPersistentChatWorkspace(
  workspaceId: string = DEFAULT_CHAT_WORKSPACE_ID,
): Promise<{ state: ChatWorkspaceState; restoring: boolean }> {
  if (!hasChatWorkspaceApi()) {
    return { state: { runs: [], activeRunId: null }, restoring: false };
  }

  // Try migrate localStorage v1 once
  try {
    if (localStorage.getItem(MIGRATION_FLAG) !== "done") {
      const raw = localStorage.getItem(CHAT_WORKSPACE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedChatWorkspace;
        if (parsed?.version === 1 && Array.isArray(parsed.runs) && parsed.runs.length > 0) {
          await window.chatWorkspace.migrateV1({
            workspaceId,
            activeRunId: parsed.activeRunId,
            runs: parsed.runs.map((r) => ({
              runId: r.runId,
              sessionId: r.sessionId,
              profileId: r.profileId,
              createdAt: r.createdAt,
              updatedAt: r.updatedAt,
              createdOrder: r.createdOrder,
              mode: r.mode,
              expertId: r.expertId,
              expertName: r.expertName,
              teamId: r.teamId,
              teamName: r.teamName,
              skillName: r.skillName,
              skillDisplayName: r.skillDisplayName,
              permissionMode: r.permissionMode,
              workMode: r.workMode,
              runState: r.runState,
              title: r.title,
              titleSource: r.titleSource,
              selectedModelId: r.selectedModelId,
              sessionFilesVisible: r.sessionFilesVisible,
              previewFileId: r.previewFileId,
              previewMaximized: r.previewMaximized,
              draft: r.draft,
            })),
          });
          localStorage.setItem(MIGRATION_FLAG, "done");
        } else {
          localStorage.setItem(MIGRATION_FLAG, "done");
        }
      } else {
        localStorage.setItem(MIGRATION_FLAG, "done");
      }
    }
  } catch {
    /* migrate best-effort */
  }

  const snapshot = await window.chatWorkspace.getSnapshot(workspaceId);
  return { state: snapshotToState(snapshot), restoring: false };
}

export function subscribeChatWorkspaceChanged(
  onSnapshot: (state: ChatWorkspaceState) => void,
  workspaceId: string = DEFAULT_CHAT_WORKSPACE_ID,
): () => void {
  if (!hasChatWorkspaceApi()) return () => undefined;
  return window.chatWorkspace.onChanged((snapshot) => {
    if (snapshot.workspaceId !== workspaceId) return;
    onSnapshot(snapshotToState(snapshot));
  });
}

/** Fallback local parse if Main is unavailable (tests). */
export function loadLocalFallback(): ChatWorkspaceState | null {
  try {
    const raw = localStorage.getItem(CHAT_WORKSPACE_STORAGE_KEY);
    if (!raw) return null;
    return deserializeChatWorkspace(JSON.parse(raw));
  } catch {
    return null;
  }
}
