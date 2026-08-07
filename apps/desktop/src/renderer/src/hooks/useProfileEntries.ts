import { useEffect, useState } from "react";
import type { ProfileEntrySummary } from "../../../shared/profile-runtime/profile-runtime-contract";

export function useProfileEntries(): ProfileEntrySummary[] {
  const [profileEntries, setProfileEntries] = useState<ProfileEntrySummary[]>([]);

  useEffect(() => {
    try {
      window.profileEntry.listProfileEntries().then(setProfileEntries).catch(() => {});
    } catch {
      /* profileEntry not available */
    }
  }, []);

  return profileEntries;
}
