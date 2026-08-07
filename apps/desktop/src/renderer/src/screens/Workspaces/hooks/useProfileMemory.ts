import { useCallback, useEffect, useState } from "react";
import { workspacesApi } from "../api/workspacesApi";
import type { AIOSMemoryFile, AIOSMemoryFileName } from "../types";

export function useProfileMemory(profileId: string | null): {
  files: AIOSMemoryFile[];
  loading: boolean;
  error: string | null;
  dirty: boolean;
  activeFile: AIOSMemoryFileName;
  draft: string;
  setActiveFile: (file: AIOSMemoryFileName) => void;
  setDraft: (content: string) => void;
  save: () => Promise<{ ok: boolean; error?: string }>;
  refetch: () => Promise<void>;
} {
  const [files, setFiles] = useState<AIOSMemoryFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<AIOSMemoryFileName>("MEMORY.md");
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);

  const refetch = useCallback(async () => {
    if (!profileId) {
      setFiles([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await workspacesApi.readMemoryFiles(profileId);
      setFiles(rows);
      const current = rows.find((f) => f.file === activeFile) ?? rows[0];
      if (current) {
        setDraft(current.content);
        setDirty(false);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [profileId, activeFile]);

  useEffect(() => {
    void refetch();
  }, [profileId, refetch]);

  const handleSetActiveFile = useCallback(
    (file: AIOSMemoryFileName) => {
      setActiveFile(file);
      const row = files.find((f) => f.file === file);
      setDraft(row?.content ?? "");
      setDirty(false);
    },
    [files],
  );

  const handleSetDraft = useCallback((content: string) => {
    setDraft(content);
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (!profileId) return { ok: false, error: "NO_PROFILE" };
    const row = files.find((f) => f.file === activeFile);
    if (row?.readonly) return { ok: false, error: "READONLY" };
    const result = await workspacesApi.writeMemoryFile(profileId, activeFile, draft);
    if (result.ok) {
      setDirty(false);
      await refetch();
    }
    return result;
  }, [profileId, activeFile, draft, files, refetch]);

  return {
    files,
    loading,
    error,
    dirty,
    activeFile,
    draft,
    setActiveFile: handleSetActiveFile,
    setDraft: handleSetDraft,
    save,
    refetch,
  };
}
