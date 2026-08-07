import { useCallback, useEffect, useState } from "react";
import type {
  McpBridgeStatus,
  McpInvocation,
  McpRuntimeEvent,
  McpServer,
  McpTool,
} from "../../../../../../../shared/mcp/mcp-contract";
import { HERMES_DEFAULT_PROFILE } from "../../../constants";

export function useMcpServers(profile = HERMES_DEFAULT_PROFILE) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await window.hermesAPI.mcp.listServers(profile);
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

  useEffect(() => {
    const unsub = window.hermesAPI.mcp.onServerStatus(() => {
      void refresh();
    });
    return unsub;
  }, [refresh]);

  return { servers, loading, error, refresh, setServers };
}

export function useMcpTools(profile = HERMES_DEFAULT_PROFILE, search = "") {
  const [tools, setTools] = useState<McpTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await window.hermesAPI.mcp.listTools({
        profile,
        source: "mcp",
        search: search.trim() || undefined,
      });
      setTools(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [profile, search]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { tools, loading, error, refresh };
}

export function useMcpInvocations(profile = HERMES_DEFAULT_PROFILE) {
  const [invocations, setInvocations] = useState<McpInvocation[]>([]);
  const [events, setEvents] = useState<McpRuntimeEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.hermesAPI.mcp.listInvocations({ profile, limit: 30 });
      setInvocations(list);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const unsub = window.hermesAPI.mcp.onEvent((evt) => {
      setEvents((prev) => [...prev.slice(-99), evt]);
      void refresh();
    });
    return unsub;
  }, [refresh]);

  return { invocations, events, loading, refresh };
}

export function useMcpBridge(profile = HERMES_DEFAULT_PROFILE) {
  const [bridge, setBridge] = useState<McpBridgeStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const status = await window.hermesAPI.mcp.checkBridge(profile);
      setBridge(status);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const install = useCallback(async () => {
    const status = await window.hermesAPI.mcp.installBridge(profile);
    setBridge(status);
    return status;
  }, [profile]);

  return { bridge, loading, refresh, install };
}
