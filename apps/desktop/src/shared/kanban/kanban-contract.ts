/**
 * Desktop Kanban IPC contract (PRD v1.7).
 * Renderer talks only via window.kanbanRuntime — never hermesAPI / CLI / kanban.db.
 */

export const KANBAN_CHANNELS = {
  getCapabilities: "kanban:get-capabilities",
  listBoards: "kanban:list-boards",
  createBoard: "kanban:create-board",
  removeBoard: "kanban:remove-board",
  listTasks: "kanban:list-tasks",
  getTask: "kanban:get-task",
  createTask: "kanban:create-task",
  executeTaskAction: "kanban:execute-task-action",
  addComment: "kanban:add-comment",
  listAssignees: "kanban:list-assignees",
  dispatch: "kanban:dispatch",
  pickDirectory: "kanban:pick-directory",
} as const;

export type KanbanTaskAction =
  | "assign"
  | "complete"
  | "block"
  | "unblock"
  | "archive"
  | "reclaim"
  | "promote"
  | "schedule"
  | "specify"
  | "decompose"
  | "link"
  | "unlink";

export interface KanbanCapabilitiesDto {
  supported: boolean;
  transport: "cli" | "plugin";
  liveEvents: boolean;
  supportsDispatch: boolean;
  supportsWorkspaceDir: boolean;
  supportsDecompose: boolean;
  supportsAttachments: boolean;
}

export interface KanbanBoardDto {
  slug: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  isCurrent: boolean;
  archived: boolean;
  total: number;
  counts: Record<string, number>;
  dbPath?: string | null;
}

export interface KanbanTaskDto {
  id: string;
  title: string;
  body?: string | null;
  assignee?: string | null;
  status: string;
  priority: number;
  tenant?: string | null;
  workspaceKind: string;
  workspacePath?: string | null;
  createdBy?: string | null;
  createdAt?: number | null;
  startedAt?: number | null;
  completedAt?: number | null;
  result?: string | null;
  skills: string[];
  maxRetries?: number | null;
  allowedActions: KanbanTaskAction[];
}

export interface KanbanCommentDto {
  id: number;
  taskId: string;
  author?: string | null;
  body: string;
  createdAt: number;
}

export interface KanbanEventDto {
  id: number;
  taskId: string;
  kind: string;
  payload?: Record<string, unknown> | null;
  createdAt: number;
  runId?: number | null;
}

export interface KanbanRunDto {
  id: number;
  taskId: string;
  profile?: string | null;
  status?: string | null;
  outcome?: string | null;
  summary?: string | null;
  error?: string | null;
  startedAt?: number | null;
  endedAt?: number | null;
  lastHeartbeatAt?: number | null;
}

export interface KanbanTaskDetailDto {
  task: KanbanTaskDto;
  comments: KanbanCommentDto[];
  events: KanbanEventDto[];
  parents: string[];
  children: string[];
  runs: KanbanRunDto[];
  latestSummary?: string | null;
}

export interface CreateKanbanBoardInputDto {
  slug: string;
  name?: string | null;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
}

export interface CreateKanbanTaskInputDto {
  title: string;
  body?: string | null;
  assignee?: string | null;
  priority?: number | null;
  tenant?: string | null;
  workspace?: string | null;
  triage?: boolean;
  skills?: string[];
  maxRetries?: number | null;
}

export interface KanbanTaskActionInputDto {
  action: KanbanTaskAction;
  assignee?: string | null;
  result?: string | null;
  reason?: string | null;
  at?: string | null;
  parentId?: string | null;
}

export interface KanbanTaskFilterDto {
  status?: string;
  assignee?: string;
  tenant?: string;
  includeArchived?: boolean;
}

export interface KanbanAssigneeDto {
  name: string;
  profile?: string | null;
  available: boolean;
}

export interface KanbanDispatchResultDto {
  dryRun: boolean;
  claimed: number;
  started: number;
  skipped: number;
  details?: Record<string, unknown> | null;
}
