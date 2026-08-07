import { useCallback, useEffect, useState } from "react";
import { hermesDefaultApi } from "../api/hermesDefaultApi";
import type { HermesSession } from "../types";

export function useHermesDefaultSessions() {
  const [sessions, setSessions] = useState<HermesSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await hermesDefaultApi.sessions.list(80, 0);
      setSessions(
        rows.map((r) => ({
          id: r.id,
          title: r.title ?? "",
          startedAt: r.startedAt,
          source: r.source,
          messageCount: r.messageCount,
          model: r.model,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const sync = useCallback(async () => {
    setError(null);
    try {
      await hermesDefaultApi.sessions.sync();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [refresh]);

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      await refresh();
      return;
    }
    setLoading(true);
    try {
      const rows = await hermesDefaultApi.sessions.search(query.trim(), 40);
      setSessions(
        rows.map((r) => ({
          id: r.sessionId,
          title: r.title ?? "",
          startedAt: r.startedAt,
          source: r.source,
          messageCount: r.messageCount,
          model: r.model,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const rename = useCallback(
    async (sessionId: string, title: string) => {
      await hermesDefaultApi.sessions.rename(sessionId, title);
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { sessions, loading, error, refresh, sync, search, rename };
}
