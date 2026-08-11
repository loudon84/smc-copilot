import { ipcRenderer } from "electron";
import {
  KANBAN_CHANNELS,
  type CreateKanbanBoardInputDto,
  type CreateKanbanTaskInputDto,
  type KanbanAssigneeDto,
  type KanbanBoardDto,
  type KanbanCapabilitiesDto,
  type KanbanDispatchResultDto,
  type KanbanTaskActionInputDto,
  type KanbanTaskDetailDto,
  type KanbanTaskDto,
  type KanbanTaskFilterDto,
} from "../shared/kanban/kanban-contract";

export const kanbanRuntimeApi = {
  getCapabilities(instanceId: string): Promise<KanbanCapabilitiesDto> {
    return ipcRenderer.invoke(KANBAN_CHANNELS.getCapabilities, instanceId);
  },

  listBoards(
    instanceId: string,
    opts?: { includeArchived?: boolean },
  ): Promise<KanbanBoardDto[]> {
    return ipcRenderer.invoke(KANBAN_CHANNELS.listBoards, instanceId, opts);
  },

  createBoard(
    instanceId: string,
    input: CreateKanbanBoardInputDto,
  ): Promise<KanbanBoardDto> {
    return ipcRenderer.invoke(KANBAN_CHANNELS.createBoard, instanceId, input);
  },

  removeBoard(instanceId: string, boardSlug: string): Promise<void> {
    return ipcRenderer.invoke(KANBAN_CHANNELS.removeBoard, instanceId, boardSlug);
  },

  listTasks(
    instanceId: string,
    boardSlug: string,
    filter?: KanbanTaskFilterDto,
  ): Promise<KanbanTaskDto[]> {
    return ipcRenderer.invoke(KANBAN_CHANNELS.listTasks, instanceId, boardSlug, filter);
  },

  getTask(
    instanceId: string,
    boardSlug: string,
    taskId: string,
  ): Promise<KanbanTaskDetailDto> {
    return ipcRenderer.invoke(KANBAN_CHANNELS.getTask, instanceId, boardSlug, taskId);
  },

  createTask(
    instanceId: string,
    boardSlug: string,
    input: CreateKanbanTaskInputDto,
  ): Promise<KanbanTaskDto> {
    return ipcRenderer.invoke(KANBAN_CHANNELS.createTask, instanceId, boardSlug, input);
  },

  executeTaskAction(
    instanceId: string,
    boardSlug: string,
    taskId: string,
    input: KanbanTaskActionInputDto,
  ): Promise<KanbanTaskDto> {
    return ipcRenderer.invoke(
      KANBAN_CHANNELS.executeTaskAction,
      instanceId,
      boardSlug,
      taskId,
      input,
    );
  },

  addComment(
    instanceId: string,
    boardSlug: string,
    taskId: string,
    text: string,
  ): Promise<void> {
    return ipcRenderer.invoke(
      KANBAN_CHANNELS.addComment,
      instanceId,
      boardSlug,
      taskId,
      text,
    );
  },

  listAssignees(instanceId: string, boardSlug: string): Promise<KanbanAssigneeDto[]> {
    return ipcRenderer.invoke(KANBAN_CHANNELS.listAssignees, instanceId, boardSlug);
  },

  dispatch(
    instanceId: string,
    boardSlug: string,
    dryRun?: boolean,
  ): Promise<KanbanDispatchResultDto> {
    return ipcRenderer.invoke(KANBAN_CHANNELS.dispatch, instanceId, boardSlug, dryRun);
  },

  pickDirectory(): Promise<string | null> {
    return ipcRenderer.invoke(KANBAN_CHANNELS.pickDirectory);
  },
};

export type KanbanRuntimeAPI = typeof kanbanRuntimeApi;
