import type { KanbanTaskAction } from "../types/kanban";

/**
 * Map drag from→to column to a Hermes lifecycle verb.
 * UI affordance only — Runtime allowedActions remains the gate.
 */
export function dragAction(from: string, to: string): KanbanTaskAction | null {
  if (from === to) return null;
  if (from === "archived") return null;
  if (from === "done") return to === "archived" ? "archive" : null;
  if (to === "done") return "complete";
  if (to === "blocked") return "block";
  if (from === "blocked" && (to === "ready" || to === "todo")) return "unblock";
  if (from === "running" && to === "ready") return "reclaim";
  if ((from === "todo" || from === "triage" || from === "scheduled") && to === "ready") {
    return "promote";
  }
  if (to === "scheduled") return "schedule";
  if (to === "archived") return "archive";
  return null;
}

export function isValidDragTransition(
  from: string,
  to: string,
  allowedActions?: KanbanTaskAction[],
): boolean {
  const action = dragAction(from, to);
  if (!action) return false;
  if (!allowedActions) return true;
  return allowedActions.includes(action);
}
