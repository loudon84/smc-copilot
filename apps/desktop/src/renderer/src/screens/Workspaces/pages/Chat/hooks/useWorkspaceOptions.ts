import { useCallback, useEffect, useState } from "react";
import { ensureCopilotServeConfig } from "../../../../../lib/copilot-serve/profile-client";
import { copilotServeFetch } from "../../../../../lib/copilot-serve/http-client";

export type WorkspaceOption = {
  id: string;
  label: string;
};

type WorkspaceRow = {
  id: string;
  name: string;
};

export function useWorkspaceOptions(profileId: string | null): {
  options: WorkspaceOption[];
  loading: boolean;
  reload: () => Promise<void>;
} {
  const [options, setOptions] = useState<WorkspaceOption[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!profileId) {
      setOptions([]);
      return;
    }
    setLoading(true);
    try {
      const config = await ensureCopilotServeConfig();
      const rows = await copilotServeFetch<WorkspaceRow[]>(config, "/api/v1/workspaces");
      if (rows.length > 0) {
        setOptions(rows.map((w) => ({ id: w.id, label: w.name })));
      } else {
        setOptions([{ id: profileId, label: "Profile home" }]);
      }
    } catch {
      setOptions([{ id: profileId, label: "Profile home" }]);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { options, loading, reload };
}
