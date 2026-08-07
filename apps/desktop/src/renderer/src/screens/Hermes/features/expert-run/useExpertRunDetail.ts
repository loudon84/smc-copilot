import { useCallback, useEffect, useState } from "react";
import { workApi } from "../../api/workApi";
import type { WorkRunDetail } from "../../model/run";

export function useExpertRunDetail(runId: string | null) {
  const [detail, setDetail] = useState<WorkRunDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!runId || !window.hermesExperts) {
      setDetail(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await workApi.runs.getDetail(runId);
      setDetail(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    void reload();
    if (!runId || !window.hermesExperts) return;

    const unsub = workApi.runs.onRuntimeEvent((event) => {
      if (event.runId === runId) void reload();
    });

    return () => {
      unsub();
    };
  }, [runId, reload]);

  const cancel = useCallback(async () => {
    if (!runId) return;
    await workApi.runs.cancel(runId);
    await reload();
  }, [runId, reload]);

  const retry = useCallback(async () => {
    if (!runId) return;
    await workApi.runs.retry(runId);
    await reload();
  }, [runId, reload]);

  return { detail, loading, error, reload, cancel, retry };
}
