import { useCallback, useEffect, useState } from "react";
import { hermesDefaultApi } from "../api/hermesDefaultApi";

export function useHermesDefaultModels() {
  const [models, setModels] = useState<
    Array<{ id: string; name: string; provider: string; model: string; baseUrl: string }>
  >([]);
  const [active, setActive] = useState<{
    provider: string;
    model: string;
    baseUrl: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, cfg] = await Promise.all([
        hermesDefaultApi.models.list(),
        hermesDefaultApi.models.getActive(),
      ]);
      setModels(list);
      setActive(cfg);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    models,
    active,
    loading,
    error,
    refresh,
    add: hermesDefaultApi.models.add,
    update: hermesDefaultApi.models.update,
    remove: hermesDefaultApi.models.remove,
    setDefault: hermesDefaultApi.models.setDefault,
  };
}
