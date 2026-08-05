/**
 * Persist chat workspace metadata (v8.0.3) — not streaming content.
 * Storage key: chat-workspace-state.v1
 */

import {
  createChatRunRecord,
  isRunBusy,
  type ChatRunRecord,
  type OpenChatRunInput,
} from "./ChatRunRecord";
import type { ChatWorkspaceState } from "./chatWorkspaceReducer";

export const CHAT_WORKSPACE_STORAGE_KEY = "chat-workspace-state.v1";

export type PersistedChatRun = {
  runId: string;
  sessionId: string | null;
  profileId: string;
  createdAt: number;
  updatedAt: number;
  createdOrder: number;
  mode: ChatRunRecord["context"]["mode"];
  expertId?: string;
  expertName?: string;
  teamId?: string;
  teamName?: string;
  skillName?: string;
  skillDisplayName?: string;
  permissionMode: ChatRunRecord["context"]["permissionMode"];
  workMode: ChatRunRecord["context"]["workMode"];
  expertRunId?: string;
  invocationSource: ChatRunRecord["execution"]["invocationSource"];
  /** Persisted runState; busy states become interrupted on restore. */
  runState: ChatRunRecord["execution"]["runState"];
  title: string;
  titleSource: ChatRunRecord["presentation"]["titleSource"];
  selectedModelId?: string;
  sessionFilesVisible: boolean;
  previewFileId?: string;
  previewMaximized: boolean;
  draft?: string;
  promptHint?: ChatRunRecord["presentation"]["promptHint"];
};

export type PersistedChatWorkspace = {
  version: 1;
  activeRunId: string | null;
  runs: PersistedChatRun[];
  savedAt: number;
};

function toPersisted(run: ChatRunRecord): PersistedChatRun {
  return {
    runId: run.runId,
    sessionId: run.identity.sessionId,
    profileId: run.identity.profileId,
    createdAt: run.identity.createdAt,
    updatedAt: run.identity.updatedAt,
    createdOrder: run.identity.createdOrder,
    mode: run.context.mode,
    expertId: run.context.expertId,
    expertName: run.context.expertName,
    teamId: run.context.teamId,
    teamName: run.context.teamName,
    skillName: run.context.skillName,
    skillDisplayName: run.context.skillDisplayName,
    permissionMode: run.context.permissionMode,
    workMode: run.context.workMode,
    expertRunId: run.execution.expertRunId,
    invocationSource: run.execution.invocationSource,
    runState: run.execution.runState,
    title: run.presentation.title,
    titleSource: run.presentation.titleSource,
    selectedModelId: run.presentation.selectedModelId,
    sessionFilesVisible: run.presentation.sessionFilesVisible,
    previewFileId: run.presentation.previewFileId,
    previewMaximized: run.presentation.previewMaximized,
    draft: run.presentation.draft,
    promptHint: run.presentation.promptHint,
  };
}

function fromPersisted(row: PersistedChatRun): ChatRunRecord {
  const input: OpenChatRunInput = {
    runId: row.runId,
    profileId: row.profileId,
    sessionId: row.sessionId,
    title: row.title,
    mode: row.mode,
    expertId: row.expertId,
    expertName: row.expertName,
    teamId: row.teamId,
    teamName: row.teamName,
    skillName: row.skillName,
    skillDisplayName: row.skillDisplayName,
    permissionMode: row.permissionMode,
    workMode: row.workMode,
    expertRunId: row.expertRunId,
    invocationSource: row.invocationSource,
    selectedModelId: row.selectedModelId,
  };
  const record = createChatRunRecord(input);
  const wasBusy = isRunBusy(row.runState);
  return {
    ...record,
    identity: {
      ...record.identity,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdOrder: row.createdOrder,
    },
    execution: {
      ...record.execution,
      runState: wasBusy ? "interrupted" : row.runState === "interrupted" ? "interrupted" : "idle",
    },
    presentation: {
      ...record.presentation,
      title: row.title || "New Chat",
      titleSource: row.titleSource || "placeholder",
      unread: false,
      sessionFilesVisible: row.sessionFilesVisible ?? false,
      previewFileId: row.previewFileId,
      previewMaximized: row.previewMaximized ?? false,
      draft: row.draft,
      promptHint: row.promptHint ?? { mode: "auto" },
    },
  };
}

export function serializeChatWorkspace(
  state: ChatWorkspaceState,
): PersistedChatWorkspace {
  return {
    version: 1,
    activeRunId: state.activeRunId,
    runs: state.runs.map(toPersisted),
    savedAt: Date.now(),
  };
}

export function deserializeChatWorkspace(
  raw: unknown,
): ChatWorkspaceState | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<PersistedChatWorkspace>;
  if (data.version !== 1 || !Array.isArray(data.runs)) return null;
  const runs = data.runs
    .filter((r): r is PersistedChatRun => Boolean(r && typeof r.runId === "string"))
    .map(fromPersisted)
    .sort((a, b) => a.identity.createdOrder - b.identity.createdOrder);
  let activeRunId = typeof data.activeRunId === "string" ? data.activeRunId : null;
  if (activeRunId && !runs.some((r) => r.runId === activeRunId)) {
    activeRunId = runs[0]?.runId ?? null;
  }
  return { runs, activeRunId };
}

export function loadChatWorkspaceState(
  storage: Storage = localStorage,
): ChatWorkspaceState | null {
  try {
    const raw = storage.getItem(CHAT_WORKSPACE_STORAGE_KEY);
    if (!raw) return null;
    return deserializeChatWorkspace(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveChatWorkspaceState(
  state: ChatWorkspaceState,
  storage: Storage = localStorage,
): void {
  try {
    storage.setItem(
      CHAT_WORKSPACE_STORAGE_KEY,
      JSON.stringify(serializeChatWorkspace(state)),
    );
  } catch {
    /* quota / private mode — ignore */
  }
}
