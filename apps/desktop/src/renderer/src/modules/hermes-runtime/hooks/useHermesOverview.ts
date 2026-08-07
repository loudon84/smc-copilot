import { useCallback, useEffect, useState } from "react";

export interface HermesOverviewState {
  loading: boolean;
  error: string | null;
  version: string | null;
  gatewayStatus: string | null;
}

export function useHermesOverview(): HermesOverviewState & { refresh: () => Promise<void> } {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [gatewayStatus, setGatewayStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ver, gwRunning] = await Promise.all([
        window.hermesAPI.getHermesVersion().catch(() => null),
        window.hermesAPI.gatewayStatus().catch(() => false),
      ]);
      setVersion(ver);
      setGatewayStatus(gwRunning ? "running" : "stopped");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { loading, error, version, gatewayStatus, refresh };
}
