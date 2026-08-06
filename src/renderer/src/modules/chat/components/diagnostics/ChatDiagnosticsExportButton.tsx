import { useCallback, useState } from "react";
import type { ChatRuntimePort } from "../../ports/ChatRuntimePort";

type Props = {
  runtime: ChatRuntimePort;
  runId: string;
};

/**
 * Export Chat Diagnostics — metadata / timeline only (no prompt / secrets).
 */
export function ChatDiagnosticsExportButton({
  runtime,
  runId,
}: Props): React.JSX.Element | null {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onExport = useCallback(async () => {
    if (!runtime.exportDiagnostics) return;
    setBusy(true);
    setError(null);
    try {
      const result = await runtime.exportDiagnostics({ runId });
      if ("ok" in result && result.ok === false) {
        setError(result.error);
        return;
      }
      const blob = new Blob([JSON.stringify(result, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chat-diagnostics-${runId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [runtime, runId]);

  if (!runtime.exportDiagnostics) return null;

  return (
    <div className="chat-diagnostics-export">
      <button
        type="button"
        className="chat-diagnostics-export-btn"
        disabled={busy}
        onClick={() => void onExport()}
        data-testid="chat-export-diagnostics"
      >
        {busy ? "Exporting…" : "Export Chat Diagnostics"}
      </button>
      {error ? (
        <span className="chat-diagnostics-export-error">{error}</span>
      ) : null}
    </div>
  );
}
