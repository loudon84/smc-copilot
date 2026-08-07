import { useCallback, useState } from "react";
import { workApi } from "../../api/workApi";
import type { WorkArtifact } from "../../model/artifact";

export function useArtifactPreview() {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewArtifact = useCallback(async (artifact: WorkArtifact) => {
    if (artifact.previewText) {
      setPreview(artifact.previewText);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await workApi.artifacts.preview(artifact.id);
      if (res.ok && res.data?.text) {
        setPreview(res.data.text);
      } else {
        setPreview(null);
        setError(res.error ?? "Preview unavailable");
      }
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const clearPreview = useCallback(() => {
    setPreview(null);
    setError(null);
  }, []);

  return { preview, loading, error, previewArtifact, clearPreview };
}
