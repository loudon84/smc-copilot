import { useEffect } from "react";
import type { WorkTaskEvent } from "../../../../../../shared/work/work-event-contract";
import { workTaskApi } from "../../api/workTaskApi";

/** 订阅任务 SSE / IPC 归一化事件流 */
export function useWorkTaskStream(
  taskId: string | null,
  onEvent: (event: WorkTaskEvent) => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled || !taskId) return;
    return workTaskApi.subscribe(taskId, onEvent);
  }, [taskId, enabled, onEvent]);
}
