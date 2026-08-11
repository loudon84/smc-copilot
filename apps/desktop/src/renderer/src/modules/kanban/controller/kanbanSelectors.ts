import {
  KANBAN_COLUMNS,
  STATUS_TONE,
  type KanbanColumnDef,
  type KanbanColumnKey,
  type KanbanTask,
} from "../types/kanban";
import type { KanbanState } from "./kanbanReducer";

export function selectRenderedColumns(state: KanbanState): KanbanColumnDef[] {
  const cols: KanbanColumnDef[] = KANBAN_COLUMNS.map((key) => ({
    key,
    tone: STATUS_TONE[key] ?? "neutral",
  }));
  if (state.showArchived) {
    cols.push({ key: "archived", tone: STATUS_TONE.archived });
  }
  if (state.unknownStatuses.length > 0) {
    cols.push({ key: "unknown", tone: STATUS_TONE.unknown });
  }
  return cols;
}

export function selectTasksByStatus(
  tasks: KanbanTask[],
  unknownStatuses: string[],
): Record<string, KanbanTask[]> {
  const known = new Set<string>([...KANBAN_COLUMNS, "archived"]);
  const buckets: Record<string, KanbanTask[]> = {};
  for (const key of known) buckets[key] = [];
  buckets.unknown = [];

  for (const task of tasks) {
    const status = (task.status || "").toLowerCase();
    if (known.has(status)) {
      buckets[status].push(task);
    } else {
      buckets.unknown.push(task);
      if (!unknownStatuses.includes(status) && status) {
        // caller tracks via SET_UNKNOWN_STATUSES
      }
    }
  }
  return buckets;
}

export function collectUnknownStatuses(tasks: KanbanTask[]): string[] {
  const known = new Set<string>([...KANBAN_COLUMNS, "archived"]);
  const found = new Set<string>();
  for (const task of tasks) {
    const status = (task.status || "").toLowerCase();
    if (status && !known.has(status)) found.add(status);
  }
  return [...found].sort();
}

export function selectActiveBoard(state: KanbanState) {
  if (!state.selectedBoardSlug) return null;
  return state.boards.find((b) => b.slug === state.selectedBoardSlug) ?? null;
}

export function isKnownColumn(key: string): key is KanbanColumnKey {
  return (
    (KANBAN_COLUMNS as readonly string[]).includes(key) ||
    key === "archived" ||
    key === "unknown"
  );
}
