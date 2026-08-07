import type { WorkTaskEvent } from "../../shared/work/work-event-contract";
import type { WorkTaskSendInput } from "../../shared/work/work-task-contract";

export type WorkTaskStreamListener = (event: WorkTaskEvent) => void;

export type WorkTaskStreamHandle = {
  taskId: string;
  input: WorkTaskSendInput;
  abort: AbortController;
};
