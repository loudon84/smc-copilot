import type { KanbanRuntimePort } from "../ports/KanbanRuntimePort";
import type { KanbanWorkspacePort } from "../ports/KanbanWorkspacePort";

function api() {
  const runtime = window.kanbanRuntime;
  if (!runtime) {
    throw new Error("Runtime unavailable");
  }
  return runtime;
}

export const runtimeKanbanAdapter: KanbanRuntimePort = {
  getCapabilities: (instanceId) => api().getCapabilities(instanceId),
  listBoards: (instanceId, opts) => api().listBoards(instanceId, opts),
  createBoard: (instanceId, input) => api().createBoard(instanceId, input),
  archiveBoard: (instanceId, boardSlug) => api().removeBoard(instanceId, boardSlug),
  listTasks: (instanceId, boardSlug, filter) =>
    api().listTasks(instanceId, boardSlug, filter),
  getTask: (instanceId, boardSlug, taskId) =>
    api().getTask(instanceId, boardSlug, taskId),
  createTask: (instanceId, boardSlug, input) =>
    api().createTask(instanceId, boardSlug, input),
  executeTaskAction: (instanceId, boardSlug, taskId, input) =>
    api().executeTaskAction(instanceId, boardSlug, taskId, input),
  addComment: (instanceId, boardSlug, taskId, text) =>
    api().addComment(instanceId, boardSlug, taskId, text),
  listAssignees: (instanceId, boardSlug) => api().listAssignees(instanceId, boardSlug),
  dispatch: (instanceId, boardSlug, dryRun) =>
    api().dispatch(instanceId, boardSlug, dryRun),
};

export const runtimeKanbanWorkspaceAdapter: KanbanWorkspacePort = {
  pickDirectory: () => api().pickDirectory(),
};
