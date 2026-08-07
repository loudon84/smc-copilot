import { useCallback, useEffect, useState } from "react";
import { workApi } from "../../api/workApi";

const GATEWAY_REFRESH_MS = 30_000;

export function useGatewayNavGate() {
  const [gatewayOnline, setGatewayOnline] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!window.hermesExperts) {
      setGatewayOnline(false);
      setLoading(false);
      return;
    }
    try {
      const health = await workApi.gateway.health();
      setGatewayOnline(Boolean(health?.ok));
    } catch {
      setGatewayOnline(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), GATEWAY_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  return { gatewayOnline, loading, refresh };
}
