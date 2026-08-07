import { useCallback, useState } from "react";
import type { ChatRuntimePort } from "../../ports/ChatRuntimePort";

type Props = {
  runtime: ChatRuntimePort;
  runId: string;
};

/**
 * Export Chat Diagnostics via Main Save Dialog (no Renderer `<a download>`).
 */
export function ChatDiagnosticsExportButton({
  runtime,
  runId,
}: Props): React.JSX.Element | null {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const onExport = useCallback(async () => {
    setBusy(true);
    setError(null);
    setSavedPath(null);
    try {
      if (runtime.saveDiagnostics) {
        const result = await runtime.saveDiagnostics({ runId });
        if (!result.ok) {
          if (!result.cancelled) setError(result.error);
          return;
        }
        setSavedPath(result.path);
        return;
      }
      if (!runtime.exportDiagnostics) return;
      const result = await runtime.exportDiagnostics({ runId });
      if ("ok" in result && result.ok === false) {
        setError(result.error);
        return;
      }
      setError("Save dialog unavailable; diagnostics assembled but not written");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [runtime, runId]);

  if (!runtime.saveDiagnostics && !runtime.exportDiagnostics) return null;

  return (
    <div className="chat-diagnostics-export">
      <button
        type="button"
        className="chat-diagnostics-export-btn"
        disabled={busy || !runId}
        onClick={() => void onExport()}
        data-testid="chat-export-diagnostics"
      >
        {busy ? "Exporting…" : "Export Chat Diagnostics"}
      </button>
      {error ? (
        <span className="chat-diagnostics-export-error">{error}</span>
      ) : null}
      {savedPath ? (
        <span className="chat-diagnostics-export-ok">Saved</span>
      ) : null}
    </div>
  );
}
