import { useCallback, useState } from "react";
import { workApi } from "../../api/workApi";
import type { WorkArtifact } from "../../model/artifact";

export type ArtifactImportTarget = {
  artifact: WorkArtifact;
  taskId: string;
};

export function useArtifactImport() {
  const [importTarget, setImportTarget] = useState<ArtifactImportTarget | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const openImport = useCallback((artifact: WorkArtifact, taskId: string) => {
    setImportTarget({ artifact, taskId });
    setImportResult(null);
    setImportError(null);
  }, []);

  const closeImport = useCallback(() => {
    setImportTarget(null);
    setImportResult(null);
    setImportError(null);
  }, []);

  const confirmImport = useCallback(
    async (targetDir?: string) => {
      if (!importTarget) return;
      setImporting(true);
      setImportResult(null);
      setImportError(null);
      try {
        const res = await workApi.artifacts.import({
          artifactId: importTarget.artifact.id,
          taskId: importTarget.taskId,
          targetDir,
        });
        if (res.ok) {
          setImportResult(res.localPath ?? "Imported");
        } else {
          setImportError(res.message ?? res.errorCode ?? "Import failed");
        }
      } catch (e) {
        setImportError(e instanceof Error ? e.message : String(e));
      } finally {
        setImporting(false);
      }
    },
    [importTarget],
  );

  return {
    importTarget,
    importing,
    importResult,
    importError,
    openImport,
    closeImport,
    confirmImport,
  };
}
