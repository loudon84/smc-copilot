import { useCallback, useEffect, useState } from "react";
import { workspacesApi } from "../api/workspacesApi";
import type { AIOSSession } from "../types";

function filterSessionsByKeyword(sessions: AIOSSession[], keyword: string): AIOSSession[] {
  const q = keyword.trim().toLowerCase();
  if (!q) return sessions;
  return sessions.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) ||
      (s.model?.toLowerCase().includes(q) ?? false),
  );
}

export type ProfileSessionsHandle = {
  sessions: AIOSSession[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
};

/** Single sessions fetch per AIOS Workspace shell — call only from WorkspacesProvider. */
export function useProfileSessions(
  profileId: string | null,
  keyword: string,
  sessionsRefreshNonce: number,
): ProfileSessionsHandle {
  const [sessions, setSessions] = useState<AIOSSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!profileId) {
      setSessions([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await workspacesApi.listSessions(profileId);
      setSessions(filterSessionsByKeyword(rows, keyword));
    } catch (err) {
      setError(String(err));
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [profileId, keyword]);

  useEffect(() => {
    const timer = setTimeout(() => void refetch(), keyword ? 300 : 0);
    return () => clearTimeout(timer);
  }, [refetch, keyword, sessionsRefreshNonce]);

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    await workspacesApi.renameSession(sessionId, title);
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, title, updatedAt: new Date().toISOString() } : s,
      ),
    );
  }, []);

  const deleteSession = useCallback(
    async (sessionId: string) => {
      if (!profileId) return;
      await workspacesApi.deleteSession(profileId, sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    },
    [profileId],
  );

  return {
    sessions,
    loading,
    error,
    refetch,
    renameSession,
    deleteSession,
  };
}
