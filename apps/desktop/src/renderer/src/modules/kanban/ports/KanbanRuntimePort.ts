import type {
  CreateKanbanBoardInput,
  CreateKanbanTaskInput,
  KanbanAssignee,
  KanbanBoard,
  KanbanCapabilities,
  KanbanDispatchResult,
  KanbanTask,
  KanbanTaskActionInput,
  KanbanTaskDetail,
  KanbanTaskFilter,
} from "../types/kanban";

export interface KanbanRuntimePort {
  getCapabilities(instanceId: string): Promise<KanbanCapabilities>;
  listBoards(
    instanceId: string,
    opts?: { includeArchived?: boolean },
  ): Promise<KanbanBoard[]>;
  createBoard(instanceId: string, input: CreateKanbanBoardInput): Promise<KanbanBoard>;
  archiveBoard(instanceId: string, boardSlug: string): Promise<void>;
  listTasks(
    instanceId: string,
    boardSlug: string,
    filter?: KanbanTaskFilter,
  ): Promise<KanbanTask[]>;
  getTask(
    instanceId: string,
    boardSlug: string,
    taskId: string,
  ): Promise<KanbanTaskDetail>;
  createTask(
    instanceId: string,
    boardSlug: string,
    input: CreateKanbanTaskInput,
  ): Promise<KanbanTask>;
  executeTaskAction(
    instanceId: string,
    boardSlug: string,
    taskId: string,
    input: KanbanTaskActionInput,
  ): Promise<KanbanTask>;
  addComment(
    instanceId: string,
    boardSlug: string,
    taskId: string,
    text: string,
  ): Promise<void>;
  listAssignees(instanceId: string, boardSlug: string): Promise<KanbanAssignee[]>;
  dispatch(
    instanceId: string,
    boardSlug: string,
    dryRun?: boolean,
  ): Promise<KanbanDispatchResult>;
}
