import { useCallback, useEffect, useState } from "react";
import { hermesDefaultApi } from "../api/hermesDefaultApi";
import { HERMES_DEFAULT_PROFILE_META } from "../constants";

export function useHermesDefaultProfile() {
  const [profile, setProfile] = useState<{
    name: string;
    displayName: string;
    isDefault: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const p = await hermesDefaultApi.profile.getDefaultProfile();
      setProfile(
        p
          ? { name: p.name, displayName: p.name, isDefault: p.isDefault }
          : {
              name: HERMES_DEFAULT_PROFILE_META.name,
              displayName: HERMES_DEFAULT_PROFILE_META.displayName,
              isDefault: true,
            },
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { profile, loading, refresh, meta: HERMES_DEFAULT_PROFILE_META };
}
