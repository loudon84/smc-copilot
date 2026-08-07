import { useCallback, useEffect, useState } from "react";
import type { ResolvedProfile } from "../../../../../../../shared/workspace-chat/workspace-chat-contract";

export function useProfileResolver(
  profileRef: string | null,
  options?: { enabled?: boolean },
): {
  resolved: ResolvedProfile | null;
  resolving: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const enabled = options?.enabled ?? true;
  const [resolved, setResolved] = useState<ResolvedProfile | null>(null);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !profileRef?.trim()) {
      setResolved(null);
      setError(null);
      return;
    }
    setResolving(true);
    setError(null);
    try {
      const row = await window.workspaceChat.resolveProfile(profileRef);
      setResolved(row);
    } catch (err) {
      setResolved(null);
      setError(String(err));
    } finally {
      setResolving(false);
    }
  }, [enabled, profileRef]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { resolved, resolving, error, refresh };
}
