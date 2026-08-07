import { useCallback, useEffect, useState } from "react";
import { workApi } from "../../api/workApi";
import type { WorkRun } from "../../model/run";
import { type RunFilterKey, toExpertRunFilter } from "./runFilter";

export function useExpertRuns(filter: RunFilterKey = "all") {
  const [runs, setRuns] = useState<WorkRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!window.hermesExperts) return;
    setLoading(true);
    setError(null);
    try {
      const list = await workApi.runs.list(toExpertRunFilter(filter));
      setRuns(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { runs, loading, error, refresh };
}
