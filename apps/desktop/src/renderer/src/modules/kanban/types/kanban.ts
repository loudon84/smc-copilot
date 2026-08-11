import type {
  CreateKanbanBoardInputDto,
  CreateKanbanTaskInputDto,
  KanbanAssigneeDto,
  KanbanBoardDto,
  KanbanCapabilitiesDto,
  KanbanDispatchResultDto,
  KanbanTaskAction,
  KanbanTaskActionInputDto,
  KanbanTaskDetailDto,
  KanbanTaskDto,
  KanbanTaskFilterDto,
} from "@shared/kanban/kanban-contract";

export type {
  CreateKanbanBoardInputDto as CreateKanbanBoardInput,
  CreateKanbanTaskInputDto as CreateKanbanTaskInput,
  KanbanAssigneeDto as KanbanAssignee,
  KanbanBoardDto as KanbanBoard,
  KanbanCapabilitiesDto as KanbanCapabilities,
  KanbanDispatchResultDto as KanbanDispatchResult,
  KanbanTaskAction,
  KanbanTaskActionInputDto as KanbanTaskActionInput,
  KanbanTaskDetailDto as KanbanTaskDetail,
  KanbanTaskDto as KanbanTask,
  KanbanTaskFilterDto as KanbanTaskFilter,
};

export const KANBAN_COLUMNS = [
  "triage",
  "todo",
  "scheduled",
  "ready",
  "running",
  "blocked",
  "review",
  "done",
] as const;

export type KanbanColumnKey = (typeof KANBAN_COLUMNS)[number] | "archived" | "unknown";

export const STATUS_TONE: Record<string, string> = {
  triage: "neutral",
  todo: "todo",
  scheduled: "scheduled",
  ready: "ready",
  running: "running",
  blocked: "blocked",
  review: "review",
  done: "done",
  archived: "archived",
  unknown: "neutral",
};

export interface KanbanColumnDef {
  key: KanbanColumnKey;
  tone: string;
}
