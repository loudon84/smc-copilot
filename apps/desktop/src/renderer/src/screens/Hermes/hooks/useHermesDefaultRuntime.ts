import { useCallback, useEffect, useRef, useState } from "react";
import { hermesDefaultApi } from "../api/hermesDefaultApi";
import type { HermesDefaultRuntimeHandle, HermesGatewayUiStatus } from "../types";

export function useHermesDefaultRuntime(): HermesDefaultRuntimeHandle {
  const [status, setStatus] = useState<HermesGatewayUiStatus>("stopped");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hermesHome, setHermesHome] = useState<string | null>(null);
  const [modelConfig, setModelConfig] = useState<{
    provider: string;
    model: string;
    baseUrl: string;
  } | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [running, home, cfg, ver] = await Promise.all([
        hermesDefaultApi.runtime.status(),
        hermesDefaultApi.runtime.home(),
        hermesDefaultApi.runtime.getModelConfig(),
        hermesDefaultApi.runtime.version(),
      ]);
      if (!mountedRef.current) return;
      setStatus(running ? "running" : "stopped");
      setHermesHome(home);
      setModelConfig(cfg);
      setVersion(ver);
      setError(null);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const id = window.setInterval(() => void refresh(), 5000);
    return () => {
      mountedRef.current = false;
      window.clearInterval(id);
    };
  }, [refresh]);

  const wrap = useCallback(
    async (fn: () => Promise<unknown>, next: HermesGatewayUiStatus) => {
      setBusy(true);
      setError(null);
      setStatus(next);
      try {
        await fn();
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const start = useCallback(
    () => wrap(() => hermesDefaultApi.runtime.start(), "starting"),
    [wrap],
  );
  const stop = useCallback(
    () => wrap(() => hermesDefaultApi.runtime.stop(), "stopping"),
    [wrap],
  );
  const restart = useCallback(
    () => wrap(() => hermesDefaultApi.runtime.restart(), "starting"),
    [wrap],
  );
  const readLogs = useCallback(
    (lines?: number) => hermesDefaultApi.runtime.logs(lines),
    [],
  );

  return {
    status,
    busy,
    error,
    hermesHome,
    modelConfig,
    version,
    refresh,
    start,
    stop,
    restart,
    readLogs,
  };
}
