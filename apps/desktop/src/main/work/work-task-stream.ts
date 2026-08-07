import type { WorkTaskEvent } from "../../shared/work/work-event-contract";
import type { WorkTaskSendInput } from "../../shared/work/work-task-contract";
import { mapRawToWorkTaskEvent } from "./work-event-mapper";

const activeStreams = new Map<string, AbortController>();

export function emitWorkTaskEvent(event: WorkTaskEvent): void {
  // hook for in-process subscribers
  void event;
}

export function stopWorkTaskStream(taskId: string): void {
  const ctrl = activeStreams.get(taskId);
  if (ctrl) {
    ctrl.abort();
    activeStreams.delete(taskId);
  }
}

export async function startWorkTaskStream(
  taskId: string,
  input: WorkTaskSendInput,
  onEvent: (event: WorkTaskEvent) => void,
): Promise<void> {
  stopWorkTaskStream(taskId);
  const controller = new AbortController();
  activeStreams.set(taskId, controller);

  onEvent({
    id: `${taskId}-started`,
    taskId,
    type: "task.started",
    createdAt: new Date().toISOString(),
    source: "desktop",
    status: "running",
  });

  // MVP: reserved for nodeskclaw Expert / Team SSE bridge
  const raw = {
    type: "agent.message.delta",
    content: input.text,
    taskId,
  };
  const mapped = mapRawToWorkTaskEvent(taskId, raw);
  if (mapped) onEvent(mapped);

  if (!controller.signal.aborted) {
    onEvent({
      id: `${taskId}-completed`,
      taskId,
      type: "task.completed",
      createdAt: new Date().toISOString(),
      source: "desktop",
      status: "completed",
    });
  }

  activeStreams.delete(taskId);
}
