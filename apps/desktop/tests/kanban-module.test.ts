import { describe, expect, it } from "vitest";
import { dragAction, isValidDragTransition } from "../src/renderer/src/modules/kanban/controller/kanbanTransitions";
import {
  collectUnknownStatuses,
  selectTasksByStatus,
} from "../src/renderer/src/modules/kanban/controller/kanbanSelectors";
import {
  kanbanReducer,
  initialKanbanState,
} from "../src/renderer/src/modules/kanban/controller/kanbanReducer";
import type { KanbanTask } from "../src/renderer/src/modules/kanban/types/kanban";

function task(partial: Partial<KanbanTask> & Pick<KanbanTask, "id" | "title" | "status">): KanbanTask {
  return {
    priority: 0,
    workspaceKind: "scratch",
    skills: [],
    allowedActions: [],
    ...partial,
  };
}

describe("kanbanTransitions", () => {
  it("maps drag targets to lifecycle verbs", () => {
    expect(dragAction("todo", "ready")).toBe("promote");
    expect(dragAction("ready", "done")).toBe("complete");
    expect(dragAction("running", "ready")).toBe("reclaim");
    expect(dragAction("blocked", "ready")).toBe("unblock");
    expect(dragAction("ready", "blocked")).toBe("block");
    expect(dragAction("todo", "scheduled")).toBe("schedule");
    expect(dragAction("done", "archived")).toBe("archive");
    expect(dragAction("archived", "todo")).toBeNull();
  });

  it("gates by allowedActions", () => {
    expect(isValidDragTransition("todo", "ready", ["promote"])).toBe(true);
    expect(isValidDragTransition("todo", "ready", ["complete"])).toBe(false);
  });
});

describe("kanbanSelectors", () => {
  it("buckets unknown statuses separately", () => {
    const tasks = [
      task({ id: "1", title: "a", status: "todo" }),
      task({ id: "2", title: "b", status: "weird" }),
    ];
    expect(collectUnknownStatuses(tasks)).toEqual(["weird"]);
    const buckets = selectTasksByStatus(tasks, ["weird"]);
    expect(buckets.todo).toHaveLength(1);
    expect(buckets.unknown).toHaveLength(1);
    expect(buckets.unknown[0]?.id).toBe("2");
  });
});

describe("kanbanReducer", () => {
  it("upserts tasks and toggles archived", () => {
    let state = kanbanReducer(initialKanbanState, {
      type: "SET_SHOW_ARCHIVED",
      showArchived: true,
    });
    expect(state.showArchived).toBe(true);
    state = kanbanReducer(state, {
      type: "UPSERT_TASK",
      task: task({ id: "T1", title: "x", status: "ready", allowedActions: ["complete"] }),
    });
    expect(state.tasks).toHaveLength(1);
    state = kanbanReducer(state, {
      type: "UPSERT_TASK",
      task: task({ id: "T1", title: "y", status: "done", allowedActions: ["archive"] }),
    });
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]?.title).toBe("y");
  });
});
