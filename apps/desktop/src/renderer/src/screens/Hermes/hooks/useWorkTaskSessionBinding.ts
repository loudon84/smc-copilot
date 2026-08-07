import { useCallback, useEffect } from "react";
import type { WorkTask } from "../../../../../shared/work/work-task-contract";
import { useHermesDefault } from "../context/HermesDefaultContext";

/** Keeps HermesDefaultContext.activeSessionId aligned with the active Work task. */
export function useWorkTaskSessionBinding(activeTask: WorkTask | null) {
  const { setActiveSessionId } = useHermesDefault();

  useEffect(() => {
    if (activeTask?.sessionId) {
      setActiveSessionId(activeTask.sessionId);
    }
  }, [activeTask?.sessionId, setActiveSessionId]);

  const bindSession = useCallback(
    (sessionId: string) => {
      setActiveSessionId(sessionId);
    },
    [setActiveSessionId],
  );

  return { bindSession };
}
