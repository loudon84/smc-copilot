import { useCallback, useEffect, useState } from "react";
import type {
  HermesMcpServerView,
  SaveHermesMcpServerInput,
} from "../../../../../shared/hermes-mcp-config/hermes-mcp-config-contract";
import { HERMES_DEFAULT_PROFILE } from "../constants";

function mcpConfigApi(): NonNullable<typeof window.hermesMcpConfig> {
  if (!window.hermesMcpConfig) {
    throw new Error("window.hermesMcpConfig is not available");
  }
  return window.hermesMcpConfig;
}

export function useHermesMcpConfig(profile: string = HERMES_DEFAULT_PROFILE) {
  const [servers, setServers] = useState<HermesMcpServerView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await mcpConfigApi().getServers(profile);
      setServers(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveServer = useCallback(
    async (input: SaveHermesMcpServerInput) => {
      setActionPending(true);
      setError(null);
      try {
        const result = await mcpConfigApi().saveServer({ ...input, profile });
        if (!result.ok) {
          setError(result.message ?? "Save failed");
          return result;
        }
        await refresh();
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        return { ok: false as const, message };
      } finally {
        setActionPending(false);
      }
    },
    [profile, refresh],
  );

  const testServer = useCallback(
    async (name: string) => mcpConfigApi().testServer(name, profile),
    [profile],
  );

  const reload = useCallback(async () => mcpConfigApi().reload(profile), [profile]);

  const listTools = useCallback(
    async (name: string) => mcpConfigApi().listTools(name, profile),
    [profile],
  );

  return {
    servers,
    loading,
    error,
    actionPending,
    refresh,
    saveServer,
    testServer,
    reload,
    listTools,
  };
}
