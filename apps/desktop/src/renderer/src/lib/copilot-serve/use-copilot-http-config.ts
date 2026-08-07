import { useCallback, useEffect, useState } from "react";
import type { CopilotServeHttpConfig } from "./http-client";
import { ensureCopilotServeConfig } from "./profile-client";

export function useCopilotHttpConfig(): {
  config: CopilotServeHttpConfig | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [config, setConfig] = useState<CopilotServeHttpConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setConfig(await ensureCopilotServeConfig());
    } catch (err) {
      setConfig(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { config, loading, error, refresh };
}
