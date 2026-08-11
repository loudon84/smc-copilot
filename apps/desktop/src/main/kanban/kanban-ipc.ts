import { BrowserWindow, dialog, ipcMain } from "electron";
import type {
  KanbanBoard,
  KanbanCapabilities,
  KanbanComment,
  KanbanEvent,
  KanbanRun,
  KanbanTask,
  KanbanTaskDetail,
} from "@smc/runtime-client";
import { kanbanClient } from "../copilot-runtime-client/clients/kanban-client";
import {
  KANBAN_CHANNELS,
  type CreateKanbanBoardInputDto,
  type CreateKanbanTaskInputDto,
  type KanbanAssigneeDto,
  type KanbanBoardDto,
  type KanbanCapabilitiesDto,
  type KanbanCommentDto,
  type KanbanDispatchResultDto,
  type KanbanEventDto,
  type KanbanRunDto,
  type KanbanTaskAction,
  type KanbanTaskActionInputDto,
  type KanbanTaskDetailDto,
  type KanbanTaskDto,
  type KanbanTaskFilterDto,
} from "../../shared/kanban/kanban-contract";

function mapCapabilities(raw: KanbanCapabilities): KanbanCapabilitiesDto {
  return {
    supported: raw.supported,
    transport: raw.transport,
    liveEvents: raw.liveEvents,
    supportsDispatch: raw.supportsDispatch,
    supportsWorkspaceDir: raw.supportsWorkspaceDir,
    supportsDecompose: raw.supportsDecompose,
    supportsAttachments: raw.supportsAttachments,
  };
}

function mapBoard(raw: KanbanBoard): KanbanBoardDto {
  return {
    slug: raw.slug,
    name: raw.name,
    description: raw.description ?? null,
    icon: raw.icon ?? null,
    color: raw.color ?? null,
    isCurrent: raw.isCurrent,
    archived: raw.archived,
    total: raw.total,
    counts: raw.counts ?? {},
    dbPath: raw.dbPath ?? null,
  };
}

function mapTask(raw: KanbanTask): KanbanTaskDto {
  return {
    id: raw.id,
    title: raw.title,
    body: raw.body ?? null,
    assignee: raw.assignee ?? null,
    status: raw.status,
    priority: raw.priority ?? 0,
    tenant: raw.tenant ?? null,
    workspaceKind: raw.workspaceKind ?? "scratch",
    workspacePath: raw.workspacePath ?? null,
    createdBy: raw.createdBy ?? null,
    createdAt: raw.createdAt ?? null,
    startedAt: raw.startedAt ?? null,
    completedAt: raw.completedAt ?? null,
    result: raw.result ?? null,
    skills: raw.skills ?? [],
    maxRetries: raw.maxRetries ?? null,
    allowedActions: (raw.allowedActions ?? []) as KanbanTaskAction[],
  };
}

function mapComment(raw: KanbanComment): KanbanCommentDto {
  return {
    id: raw.id,
    taskId: raw.taskId,
    author: raw.author ?? null,
    body: raw.body,
    createdAt: raw.createdAt,
  };
}

function mapEvent(raw: KanbanEvent): KanbanEventDto {
  return {
    id: raw.id,
    taskId: raw.taskId,
    kind: raw.kind,
    payload: (raw.payload as Record<string, unknown> | null | undefined) ?? null,
    createdAt: raw.createdAt,
    runId: raw.runId ?? null,
  };
}

function mapRun(raw: KanbanRun): KanbanRunDto {
  return {
    id: raw.id,
    taskId: raw.taskId,
    profile: raw.profile ?? null,
    status: raw.status ?? null,
    outcome: raw.outcome ?? null,
    summary: raw.summary ?? null,
    error: raw.error ?? null,
    startedAt: raw.startedAt ?? null,
    endedAt: raw.endedAt ?? null,
    lastHeartbeatAt: raw.lastHeartbeatAt ?? null,
  };
}

function mapDetail(raw: KanbanTaskDetail): KanbanTaskDetailDto {
  return {
    task: mapTask(raw.task),
    comments: (raw.comments ?? []).map(mapComment),
    events: (raw.events ?? []).map(mapEvent),
    parents: raw.parents ?? [],
    children: raw.children ?? [],
    runs: (raw.runs ?? []).map(mapRun),
    latestSummary: raw.latestSummary ?? null,
  };
}

export function registerKanbanIpc(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(
    KANBAN_CHANNELS.getCapabilities,
    async (_e, instanceId: string): Promise<KanbanCapabilitiesDto> => {
      return mapCapabilities(await kanbanClient.getCapabilities(instanceId));
    },
  );

  ipcMain.handle(
    KANBAN_CHANNELS.listBoards,
    async (
      _e,
      instanceId: string,
      opts?: { includeArchived?: boolean },
    ): Promise<KanbanBoardDto[]> => {
      const result = await kanbanClient.listBoards(instanceId, opts);
      return (result.boards ?? []).map(mapBoard);
    },
  );

  ipcMain.handle(
    KANBAN_CHANNELS.createBoard,
    async (
      _e,
      instanceId: string,
      input: CreateKanbanBoardInputDto,
    ): Promise<KanbanBoardDto> => {
      return mapBoard(
        await kanbanClient.createBoard(instanceId, {
          slug: input.slug,
          name: input.name ?? undefined,
          description: input.description ?? undefined,
          icon: input.icon ?? undefined,
          color: input.color ?? undefined,
        }),
      );
    },
  );

  ipcMain.handle(
    KANBAN_CHANNELS.removeBoard,
    async (_e, instanceId: string, boardSlug: string): Promise<void> => {
      await kanbanClient.removeBoard(instanceId, boardSlug);
    },
  );

  ipcMain.handle(
    KANBAN_CHANNELS.listTasks,
    async (
      _e,
      instanceId: string,
      boardSlug: string,
      filter?: KanbanTaskFilterDto,
    ): Promise<KanbanTaskDto[]> => {
      const result = await kanbanClient.listTasks(instanceId, boardSlug, filter);
      return (result.tasks ?? []).map(mapTask);
    },
  );

  ipcMain.handle(
    KANBAN_CHANNELS.getTask,
    async (
      _e,
      instanceId: string,
      boardSlug: string,
      taskId: string,
    ): Promise<KanbanTaskDetailDto> => {
      return mapDetail(await kanbanClient.getTask(instanceId, boardSlug, taskId));
    },
  );

  ipcMain.handle(
    KANBAN_CHANNELS.createTask,
    async (
      _e,
      instanceId: string,
      boardSlug: string,
      input: CreateKanbanTaskInputDto,
    ): Promise<KanbanTaskDto> => {
      return mapTask(
        await kanbanClient.createTask(instanceId, boardSlug, {
          title: input.title,
          body: input.body ?? undefined,
          assignee: input.assignee ?? undefined,
          priority: input.priority ?? undefined,
          tenant: input.tenant ?? undefined,
          workspace: input.workspace ?? undefined,
          triage: input.triage ?? false,
          skills: input.skills ?? [],
          maxRetries: input.maxRetries ?? undefined,
        }),
      );
    },
  );

  ipcMain.handle(
    KANBAN_CHANNELS.executeTaskAction,
    async (
      _e,
      instanceId: string,
      boardSlug: string,
      taskId: string,
      input: KanbanTaskActionInputDto,
    ): Promise<KanbanTaskDto> => {
      return mapTask(
        await kanbanClient.executeTaskAction(instanceId, boardSlug, taskId, {
          action: input.action,
          assignee: input.assignee ?? undefined,
          result: input.result ?? undefined,
          reason: input.reason ?? undefined,
          at: input.at ?? undefined,
          parentId: input.parentId ?? undefined,
        }),
      );
    },
  );

  ipcMain.handle(
    KANBAN_CHANNELS.addComment,
    async (
      _e,
      instanceId: string,
      boardSlug: string,
      taskId: string,
      text: string,
    ): Promise<void> => {
      await kanbanClient.addComment(instanceId, boardSlug, taskId, text);
    },
  );

  ipcMain.handle(
    KANBAN_CHANNELS.listAssignees,
    async (
      _e,
      instanceId: string,
      boardSlug: string,
    ): Promise<KanbanAssigneeDto[]> => {
      const result = await kanbanClient.listAssignees(instanceId, boardSlug);
      return (result.assignees ?? []).map((a) => ({
        name: a.name,
        profile: a.profile ?? null,
        available: a.available ?? true,
      }));
    },
  );

  ipcMain.handle(
    KANBAN_CHANNELS.dispatch,
    async (
      _e,
      instanceId: string,
      boardSlug: string,
      dryRun?: boolean,
    ): Promise<KanbanDispatchResultDto> => {
      const result = await kanbanClient.dispatch(instanceId, boardSlug, {
        dryRun: dryRun ?? false,
      });
      return {
        dryRun: result.dryRun,
        claimed: result.claimed,
        started: result.started,
        skipped: result.skipped,
        details: (result.details as Record<string, unknown> | null | undefined) ?? null,
      };
    },
  );

  ipcMain.handle(
    KANBAN_CHANNELS.pickDirectory,
    async (): Promise<string | null> => {
      const win = getMainWindow();
      const result = win
        ? await dialog.showOpenDialog(win, { properties: ["openDirectory"] })
        : await dialog.showOpenDialog({ properties: ["openDirectory"] });
      if (result.canceled || !result.filePaths[0]) return null;
      return result.filePaths[0];
    },
  );
}
