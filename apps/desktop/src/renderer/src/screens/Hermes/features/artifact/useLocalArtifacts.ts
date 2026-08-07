import { useCallback, useEffect, useState } from "react";
import { workApi } from "../../api/workApi";
import type { WorkArtifact } from "../../model/artifact";

export function useLocalArtifacts(limit = 50) {
  const [artifacts, setArtifacts] = useState<WorkArtifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!window.hermesExperts) return;
    setLoading(true);
    setError(null);
    try {
      const list = await workApi.artifacts.listLocal(limit);
      setArtifacts(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { artifacts, loading, error, refresh };
}
