import { useCallback, useEffect, useState } from "react";
import { workspacesApi } from "../api/workspacesApi";
import type { WorkspaceFileEntry, WorkspaceGitStatus } from "../types";

export function useWorkspaceTree(profileId: string | null): {
  currentPath: string;
  entries: WorkspaceFileEntry[];
  preview: { path: string; content: string; encoding: "utf8" | "base64" } | null;
  loading: boolean;
  error: string | null;
  hermesHome: string;
  gitStatus: WorkspaceGitStatus;
  navigate: (path: string) => void;
  openFile: (path: string) => Promise<void>;
  refetch: () => Promise<void>;
} {
  const [currentPath, setCurrentPath] = useState(".");
  const [entries, setEntries] = useState<WorkspaceFileEntry[]>([]);
  const [preview, setPreview] = useState<{
    path: string;
    content: string;
    encoding: "utf8" | "base64";
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hermesHome, setHermesHome] = useState("");
  const [gitStatus, setGitStatus] = useState<WorkspaceGitStatus>({
    branch: null,
    dirtyCount: 0,
  });

  const refetch = useCallback(async () => {
    if (!profileId) {
      setEntries([]);
      setGitStatus({ branch: null, dirtyCount: 0 });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [list, home, git] = await Promise.all([
        workspacesApi.listWorkspaceFiles(profileId, currentPath),
        workspacesApi.getHermesHome(profileId),
        workspacesApi.getWorkspaceGitStatus(profileId),
      ]);
      setEntries(list);
      setHermesHome(home);
      setGitStatus(git);
    } catch (err) {
      setError(String(err));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [profileId, currentPath]);

  useEffect(() => {
    setCurrentPath(".");
    setPreview(null);
  }, [profileId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const navigate = useCallback((path: string) => {
    setCurrentPath(path || ".");
    setPreview(null);
  }, []);

  const openFile = useCallback(
    async (path: string) => {
      if (!profileId) return;
      const result = await workspacesApi.readWorkspaceFile(profileId, path);
      if (result.ok) {
        setPreview({
          path,
          content: result.content,
          encoding: result.encoding,
        });
      } else {
        setError(result.error);
      }
    },
    [profileId],
  );

  return {
    currentPath,
    entries,
    preview,
    loading,
    error,
    hermesHome,
    gitStatus,
    navigate,
    openFile,
    refetch,
  };
}
