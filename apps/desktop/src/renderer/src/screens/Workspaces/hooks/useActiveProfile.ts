import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDbExpertProfiles, mergeExpertProfiles } from "../api/mergeExpertProfiles";
import { workspacesApi } from "../api/workspacesApi";
import { LEGACY_EXPERT_PROFILE_ID_ALIASES } from "../constants";
import { useWorkspaces } from "../context/WorkspacesContext";
import { enrichDefaultFromLegacyGateway } from "./syncWorkspacesProfileRuntime";

export function useActiveProfile(): {
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const { setProfiles, setActiveProfileId, activeProfileId } = useWorkspaces();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialLoadDone = useRef(false);

  const refetch = useCallback(
    async (options?: { showLoading?: boolean }) => {
      const showLoading = options?.showLoading ?? !initialLoadDone.current;
      if (showLoading) {
        setLoading(true);
      }
      setError(null);
      try {
        const [dbList, runtime] = await Promise.all([
          fetchDbExpertProfiles(),
          workspacesApi.getRuntimeStatus(),
        ]);
        let list = mergeExpertProfiles(dbList, runtime);
        list = await enrichDefaultFromLegacyGateway(list);
        setProfiles(list);

        const resolveId = (key: string | null): string | null => {
          if (!key) return null;
          const normalized = LEGACY_EXPERT_PROFILE_ID_ALIASES[key] ?? key;
          const hit = list.find((p) => p.id === normalized || p.name === normalized);
          return hit?.id ?? null;
        };
        const resolved = resolveId(activeProfileId);
        if (resolved) {
          if (resolved !== activeProfileId) setActiveProfileId(resolved);
        } else if (list.length > 0) {
          setActiveProfileId(list[0].id);
        }
        initialLoadDone.current = true;
      } catch (err) {
        setError(String(err));
        const fallback = await enrichDefaultFromLegacyGateway(mergeExpertProfiles([], []));
        setProfiles(fallback);
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [activeProfileId, setActiveProfileId, setProfiles],
  );

  useEffect(() => {
    void refetch({ showLoading: true });
  }, [refetch]);

  return { loading, error, refetch: () => refetch({ showLoading: true }) };
}
