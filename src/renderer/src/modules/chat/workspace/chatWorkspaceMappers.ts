/**
 * Map Main ChatWorkspaceSnapshot / RunRow ↔ Renderer ChatRunRecord.
 */

import type {
  ChatWorkspaceRunRow,
  ChatWorkspaceSnapshot,
} from "@shared/chat-workspace/chat-workspace-contract";
import {
  createChatRunRecord,
  ensureCreatedOrderAtLeast,
  type ChatRunRecord,
  type OpenChatRunInput,
} from "./ChatRunRecord";
import type { ChatWorkspaceState } from "./chatWorkspaceReducer";

export function runRowToRecord(row: ChatWorkspaceRunRow): ChatRunRecord {
  const input: OpenChatRunInput = {
    runId: row.runId,
    profileId: row.profileId,
    sessionId: row.sessionId,
    title: row.title,
    mode: row.mode,
    expertId: row.expertId ?? undefined,
    expertName: row.expertName ?? undefined,
    teamId: row.teamId ?? undefined,
    teamName: row.teamName ?? undefined,
    skillName: row.skillName ?? undefined,
    skillDisplayName: row.skillDisplayName ?? undefined,
    permissionMode: row.permissionMode,
    workMode: row.workMode,
    selectedModelId: row.modelId ?? undefined,
  };
  const record = createChatRunRecord(input);
  return {
    ...record,
    identity: {
      ...record.identity,
      sessionId: row.sessionId,
      profileId: row.profileId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdOrder: row.position + 1,
    },
    execution: {
      ...record.execution,
      runState: row.runState,
    },
    presentation: {
      ...record.presentation,
      title: row.title || "New Chat",
      titleSource: row.titleSource || "placeholder",
      selectedModelId: row.modelId ?? undefined,
      sessionFilesVisible: row.filesVisible,
      previewFileId: row.previewFileId ?? undefined,
      previewMaximized: row.previewMaximized,
      draft: row.draft ?? undefined,
    },
  };
}

export function snapshotToState(
  snapshot: ChatWorkspaceSnapshot,
): ChatWorkspaceState {
  const runs = snapshot.runs.map(runRowToRecord);
  const maxOrder = runs.reduce(
    (acc, r) => Math.max(acc, r.identity.createdOrder),
    0,
  );
  ensureCreatedOrderAtLeast(maxOrder);
  let activeRunId = snapshot.activeRunId;
  if (activeRunId && !runs.some((r) => r.runId === activeRunId)) {
    activeRunId = runs[0]?.runId ?? null;
  }
  return { runs, activeRunId };
}

export function recordToOpenInput(run: ChatRunRecord): OpenChatRunInput {
  return {
    runId: run.runId,
    profileId: run.identity.profileId,
    sessionId: run.identity.sessionId,
    title: run.presentation.title,
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
    selectedModelId: run.presentation.selectedModelId,
  };
}
