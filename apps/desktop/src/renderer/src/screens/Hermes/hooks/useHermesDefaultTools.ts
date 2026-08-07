import { useCallback, useEffect, useState } from "react";
import { hermesDefaultApi } from "../api/hermesDefaultApi";

export function useHermesDefaultTools() {
  const [toolsets, setToolsets] = useState<
    Array<{ key: string; label: string; description: string; enabled: boolean }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await hermesDefaultApi.tools.list();
      setToolsets(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const setEnabled = useCallback(
    async (key: string, enabled: boolean) => {
      await hermesDefaultApi.tools.setEnabled(key, enabled);
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { toolsets, loading, error, refresh, setEnabled };
}
