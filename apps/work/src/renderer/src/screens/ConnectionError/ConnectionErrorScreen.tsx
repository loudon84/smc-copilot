import { useState } from "react";
import type { HermesRuntimeProbe } from "../../../../shared/runtime/runtime-contract";
import ConnectionErrorDetails from "./ConnectionErrorDetails";
import "./connection-error.css";

interface ConnectionErrorScreenProps {
  status: HermesRuntimeProbe | null;
  error: string | null;
  connecting?: boolean;
  onReconnect: () => void;
  onSelectHermesHome: () => void;
  onOpenLogs: () => void;
  onOpenConnectionSettings: () => void;
  onQuit: () => void;
}

function ConnectionErrorScreen({
  status,
  error,
  connecting,
  onReconnect,
  onSelectHermesHome,
  onOpenLogs,
  onOpenConnectionSettings,
  onQuit,
}: ConnectionErrorScreenProps): React.JSX.Element {
  const [busy, setBusy] = useState(false);

  async function wrap(action: () => void | Promise<void>): Promise<void> {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="connection-error">
      <div className="connection-error-card">
        <h1>Cannot connect to Hermes Agent</h1>
        <p className="connection-error-lead">
          Copilot Desktop needs a local Hermes Agent runtime and a healthy
          Gateway. Install or configure Hermes separately, then reconnect.
        </p>
        <ConnectionErrorDetails status={status} error={error} />
        <div className="connection-error-actions">
          <button
            type="button"
            className="primary"
            disabled={busy || connecting}
            onClick={() => void wrap(onReconnect)}
          >
            {connecting || busy ? "Connecting…" : "Reconnect"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void wrap(onSelectHermesHome)}
          >
            Choose Hermes directory
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void wrap(onOpenLogs)}
          >
            Open Hermes logs
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void wrap(onOpenConnectionSettings)}
          >
            Open connection settings
          </button>
          <button
            type="button"
            className="danger"
            disabled={busy}
            onClick={() => void wrap(onQuit)}
          >
            Quit
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConnectionErrorScreen;
