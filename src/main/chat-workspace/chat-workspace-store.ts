/**
 * v8.2 — Chat workspace SQLite store CRUD.
 */

import type {
  ChatWorkspaceRunRow,
  ChatWorkspaceSnapshot,
} from "../../shared/chat-workspace/chat-workspace-contract";
import { DEFAULT_CHAT_WORKSPACE_ID } from "../../shared/chat-workspace/chat-workspace-contract";
import { getChatWorkspaceDb } from "./chat-workspace-db";

type RunRowSql = {
  run_id: string;
  workspace_id: string;
  profile_id: string;
  session_id: string | null;
  position: number;
  title: string;
  title_source: string;
  mode: string;
  expert_id: string | null;
  expert_name: string | null;
  team_id: string | null;
  team_name: string | null;
  skill_name: string | null;
  skill_display_name: string | null;
  work_mode: string;
  permission_mode: string;
  model_id: string | null;
  run_state: string;
  draft: string | null;
  files_visible: number;
  preview_file_id: string | null;
  preview_maximized: number;
  created_at: number;
  updated_at: number;
  closed_at: number | null;
};

function mapRun(row: RunRowSql): ChatWorkspaceRunRow {
  return {
    runId: row.run_id,
    workspaceId: row.workspace_id,
    profileId: row.profile_id,
    sessionId: row.session_id,
    position: row.position,
    title: row.title,
    titleSource: row.title_source as ChatWorkspaceRunRow["titleSource"],
    mode: row.mode as ChatWorkspaceRunRow["mode"],
    expertId: row.expert_id,
    expertName: row.expert_name,
    teamId: row.team_id,
    teamName: row.team_name,
    skillName: row.skill_name,
    skillDisplayName: row.skill_display_name,
    workMode: row.work_mode as ChatWorkspaceRunRow["workMode"],
    permissionMode: row.permission_mode as ChatWorkspaceRunRow["permissionMode"],
    modelId: row.model_id,
    runState: row.run_state as ChatWorkspaceRunRow["runState"],
    draft: row.draft,
    filesVisible: row.files_visible === 1,
    previewFileId: row.preview_file_id,
    previewMaximized: row.preview_maximized === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
  };
}

export function ensureWorkspace(
  workspaceId: string = DEFAULT_CHAT_WORKSPACE_ID,
): void {
  const db = getChatWorkspaceDb();
  const now = Date.now();
  db.prepare(
    `INSERT OR IGNORE INTO chat_workspace (workspace_id, active_run_id, created_at, updated_at)
     VALUES (?, NULL, ?, ?)`,
  ).run(workspaceId, now, now);
}

export function getMeta(key: string): string | null {
  const db = getChatWorkspaceDb();
  const row = db
    .prepare(`SELECT value FROM chat_workspace_meta WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  const db = getChatWorkspaceDb();
  db.prepare(
    `INSERT INTO chat_workspace_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

export function listOpenRuns(
  workspaceId: string = DEFAULT_CHAT_WORKSPACE_ID,
): ChatWorkspaceRunRow[] {
  const db = getChatWorkspaceDb();
  ensureWorkspace(workspaceId);
  const rows = db
    .prepare(
      `SELECT * FROM chat_workspace_run
       WHERE workspace_id = ? AND closed_at IS NULL
       ORDER BY position ASC, created_at ASC`,
    )
    .all(workspaceId) as RunRowSql[];
  return rows.map(mapRun);
}

export function listDraftRuns(
  workspaceId: string = DEFAULT_CHAT_WORKSPACE_ID,
): ChatWorkspaceRunRow[] {
  return listOpenRuns(workspaceId).filter((r) => !r.sessionId);
}

export function getRun(runId: string): ChatWorkspaceRunRow | null {
  const db = getChatWorkspaceDb();
  const row = db
    .prepare(`SELECT * FROM chat_workspace_run WHERE run_id = ?`)
    .get(runId) as RunRowSql | undefined;
  return row ? mapRun(row) : null;
}

export function findRunBySession(
  profileId: string,
  sessionId: string,
  workspaceId: string = DEFAULT_CHAT_WORKSPACE_ID,
): ChatWorkspaceRunRow | null {
  const db = getChatWorkspaceDb();
  const row = db
    .prepare(
      `SELECT * FROM chat_workspace_run
       WHERE workspace_id = ? AND profile_id = ? AND session_id = ?
         AND closed_at IS NULL
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(workspaceId, profileId, sessionId) as RunRowSql | undefined;
  return row ? mapRun(row) : null;
}

export function getActiveRunId(
  workspaceId: string = DEFAULT_CHAT_WORKSPACE_ID,
): string | null {
  const db = getChatWorkspaceDb();
  ensureWorkspace(workspaceId);
  const row = db
    .prepare(
      `SELECT active_run_id FROM chat_workspace WHERE workspace_id = ?`,
    )
    .get(workspaceId) as { active_run_id: string | null } | undefined;
  return row?.active_run_id ?? null;
}

export function setActiveRunId(
  workspaceId: string,
  runId: string | null,
): void {
  const db = getChatWorkspaceDb();
  ensureWorkspace(workspaceId);
  const now = Date.now();
  db.prepare(
    `UPDATE chat_workspace SET active_run_id = ?, updated_at = ? WHERE workspace_id = ?`,
  ).run(runId, now, workspaceId);
}

export function insertRun(row: ChatWorkspaceRunRow): void {
  const db = getChatWorkspaceDb();
  ensureWorkspace(row.workspaceId);
  db.prepare(
    `INSERT INTO chat_workspace_run (
      run_id, workspace_id, profile_id, session_id, position,
      title, title_source, mode, expert_id, expert_name, team_id, team_name,
      skill_name, skill_display_name, work_mode, permission_mode, model_id,
      run_state, draft, files_visible, preview_file_id, preview_maximized,
      created_at, updated_at, closed_at
    ) VALUES (
      @runId, @workspaceId, @profileId, @sessionId, @position,
      @title, @titleSource, @mode, @expertId, @expertName, @teamId, @teamName,
      @skillName, @skillDisplayName, @workMode, @permissionMode, @modelId,
      @runState, @draft, @filesVisible, @previewFileId, @previewMaximized,
      @createdAt, @updatedAt, @closedAt
    )`,
  ).run({
    runId: row.runId,
    workspaceId: row.workspaceId,
    profileId: row.profileId,
    sessionId: row.sessionId,
    position: row.position,
    title: row.title,
    titleSource: row.titleSource,
    mode: row.mode,
    expertId: row.expertId ?? null,
    expertName: row.expertName ?? null,
    teamId: row.teamId ?? null,
    teamName: row.teamName ?? null,
    skillName: row.skillName ?? null,
    skillDisplayName: row.skillDisplayName ?? null,
    workMode: row.workMode,
    permissionMode: row.permissionMode,
    modelId: row.modelId ?? null,
    runState: row.runState,
    draft: row.draft ?? null,
    filesVisible: row.filesVisible ? 1 : 0,
    previewFileId: row.previewFileId ?? null,
    previewMaximized: row.previewMaximized ? 1 : 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    closedAt: row.closedAt ?? null,
  });
  touchWorkspace(row.workspaceId);
}

export function updateRunFields(
  runId: string,
  fields: Partial<ChatWorkspaceRunRow>,
): ChatWorkspaceRunRow | null {
  const existing = getRun(runId);
  if (!existing) return null;
  const next: ChatWorkspaceRunRow = {
    ...existing,
    ...fields,
    runId: existing.runId,
    workspaceId: existing.workspaceId,
    updatedAt: Date.now(),
  };
  const db = getChatWorkspaceDb();
  db.prepare(
    `UPDATE chat_workspace_run SET
      profile_id = @profileId,
      session_id = @sessionId,
      position = @position,
      title = @title,
      title_source = @titleSource,
      mode = @mode,
      expert_id = @expertId,
      expert_name = @expertName,
      team_id = @teamId,
      team_name = @teamName,
      skill_name = @skillName,
      skill_display_name = @skillDisplayName,
      work_mode = @workMode,
      permission_mode = @permissionMode,
      model_id = @modelId,
      run_state = @runState,
      draft = @draft,
      files_visible = @filesVisible,
      preview_file_id = @previewFileId,
      preview_maximized = @previewMaximized,
      updated_at = @updatedAt,
      closed_at = @closedAt
     WHERE run_id = @runId`,
  ).run({
    runId: next.runId,
    profileId: next.profileId,
    sessionId: next.sessionId,
    position: next.position,
    title: next.title,
    titleSource: next.titleSource,
    mode: next.mode,
    expertId: next.expertId ?? null,
    expertName: next.expertName ?? null,
    teamId: next.teamId ?? null,
    teamName: next.teamName ?? null,
    skillName: next.skillName ?? null,
    skillDisplayName: next.skillDisplayName ?? null,
    workMode: next.workMode,
    permissionMode: next.permissionMode,
    modelId: next.modelId ?? null,
    runState: next.runState,
    draft: next.draft ?? null,
    filesVisible: next.filesVisible ? 1 : 0,
    previewFileId: next.previewFileId ?? null,
    previewMaximized: next.previewMaximized ? 1 : 0,
    updatedAt: next.updatedAt,
    closedAt: next.closedAt ?? null,
  });
  touchWorkspace(next.workspaceId);
  return next;
}

export function closeRun(runId: string): ChatWorkspaceRunRow | null {
  return updateRunFields(runId, { closedAt: Date.now() });
}

export function reorderRuns(
  workspaceId: string,
  runIds: string[],
): void {
  const db = getChatWorkspaceDb();
  const now = Date.now();
  const tx = db.transaction(() => {
    runIds.forEach((runId, index) => {
      db.prepare(
        `UPDATE chat_workspace_run SET position = ?, updated_at = ?
         WHERE run_id = ? AND workspace_id = ? AND closed_at IS NULL`,
      ).run(index, now, runId, workspaceId);
    });
    touchWorkspace(workspaceId);
  });
  tx();
}

export function nextPosition(workspaceId: string): number {
  const db = getChatWorkspaceDb();
  const row = db
    .prepare(
      `SELECT COALESCE(MAX(position), -1) AS max_pos
       FROM chat_workspace_run
       WHERE workspace_id = ? AND closed_at IS NULL`,
    )
    .get(workspaceId) as { max_pos: number };
  return (row?.max_pos ?? -1) + 1;
}

export function getSnapshot(
  workspaceId: string = DEFAULT_CHAT_WORKSPACE_ID,
): ChatWorkspaceSnapshot {
  ensureWorkspace(workspaceId);
  const runs = listOpenRuns(workspaceId);
  let activeRunId = getActiveRunId(workspaceId);
  if (activeRunId && !runs.some((r) => r.runId === activeRunId)) {
    activeRunId = runs[0]?.runId ?? null;
    setActiveRunId(workspaceId, activeRunId);
  }
  const db = getChatWorkspaceDb();
  const ws = db
    .prepare(`SELECT updated_at FROM chat_workspace WHERE workspace_id = ?`)
    .get(workspaceId) as { updated_at: number } | undefined;
  return {
    workspaceId,
    activeRunId,
    runs,
    updatedAt: ws?.updated_at ?? Date.now(),
  };
}

function touchWorkspace(workspaceId: string): void {
  const db = getChatWorkspaceDb();
  db.prepare(
    `UPDATE chat_workspace SET updated_at = ? WHERE workspace_id = ?`,
  ).run(Date.now(), workspaceId);
}

export function countOpenRuns(workspaceId: string): number {
  const db = getChatWorkspaceDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM chat_workspace_run
       WHERE workspace_id = ? AND closed_at IS NULL`,
    )
    .get(workspaceId) as { n: number };
  return row?.n ?? 0;
}
