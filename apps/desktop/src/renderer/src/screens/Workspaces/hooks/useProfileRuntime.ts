import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { workspacesApi } from "../api/workspacesApi";
import type { AIOSProfile, ProfileRuntimeStatus } from "../types";
import { applyRuntimeStatesToProfiles } from "./syncWorkspacesProfileRuntime";

export type ProfileRuntimeHandle = {
  status: ProfileRuntimeStatus;
  healthy: boolean;
  port: number | null;
  pid: number | null;
  lastError: string | null;
  actionLoading: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
  refresh: () => Promise<void>;
};

/**
 * Runtime sync for Workspaces status cards — event-driven, no interval poll.
 * Initial profile list comes from useActiveProfile; this hook keeps runtime fields fresh.
 */
export function useProfileRuntime(
  profileId: string | null,
  profiles: AIOSProfile[],
  setProfiles: Dispatch<SetStateAction<AIOSProfile[]>>,
): ProfileRuntimeHandle {
  const profile = profiles.find((p) => p.id === profileId) ?? null;
  const [actionLoading, setActionLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;

  const refresh = useCallback(async () => {
    const prev = profilesRef.current;
    if (prev.length === 0) return;

    try {
      const { profiles: next, activeLastError } = await applyRuntimeStatesToProfiles(prev, {
        probeProfileId: profileId,
      });
      setProfiles(next);
      if (profileId) {
        setLastError(activeLastError);
      }
    } catch (err) {
      setLastError(String(err));
    }
  }, [profileId, setProfiles]);

  useEffect(() => {
    if (profiles.length === 0) return;
    void refresh();
  }, [profileId, profiles.length, refresh]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    const onRuntimeChange = (): void => {
      void refresh();
    };

    if (window.copilotServe?.onStatusChanged) {
      unsubs.push(window.copilotServe.onStatusChanged(onRuntimeChange));
    }
    unsubs.push(window.profileRuntime.onRuntimeStatusChanged(onRuntimeChange));

    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }, [refresh]);

  const runAction = useCallback(
    async (fn: () => Promise<unknown>) => {
      if (!profileId) return;
      setActionLoading(true);
      setLastError(null);
      try {
        await fn();
        await refresh();
      } catch (err) {
        setLastError(String(err));
      } finally {
        setActionLoading(false);
      }
    },
    [profileId, refresh],
  );

  return {
    status: profile?.status ?? "stopped",
    healthy: profile?.healthy ?? false,
    port: profile?.gatewayPort ?? null,
    pid: profile?.pid ?? null,
    lastError,
    actionLoading,
    start: () => runAction(() => workspacesApi.startProfile(profileId!)),
    stop: () => runAction(() => workspacesApi.stopProfile(profileId!)),
    restart: () => runAction(() => workspacesApi.restartProfile(profileId!)),
    refresh,
  };
}
