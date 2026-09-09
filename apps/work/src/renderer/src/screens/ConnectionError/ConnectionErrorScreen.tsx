import { useEffect, useState } from "react";
import type { HermesRuntimeProbe } from "../../../../shared/runtime/runtime-contract";
import type { HermesControlOwner } from "../../../../shared/runtime/control-owner";
import ConnectionErrorDetails from "./ConnectionErrorDetails";
import "./connection-error.css";

/** Production default contract. Self-Install UI is unreachable under this id. */
const MANAGED_RUNTIME_CONTRACT = "managed-local-v1";

function isEnterpriseManagedOwner(owner: HermesControlOwner | undefined): boolean {
  return owner === "salt" || owner === "opsi";
}

function isSelfInstallUnreachable(owner: HermesControlOwner | undefined): boolean {
  return (
    MANAGED_RUNTIME_CONTRACT === "managed-local-v1" ||
    isEnterpriseManagedOwner(owner)
  );
}

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
  const [owner, setOwner] = useState<HermesControlOwner | undefined>(undefined);

  useEffect(() => {
    void window.hermesAPI.getControlOwner().then((snapshot) => {
      setOwner(snapshot.owner);
    });
  }, []);

  async function wrap(action: () => void | Promise<void>): Promise<void> {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  const managedMode = isEnterpriseManagedOwner(owner);
  const selfInstallUnreachable = isSelfInstallUnreachable(owner);

  return (
    <div className="connection-error">
      <div className="connection-error-card">
        <h1>
          {managedMode
            ? "Waiting for enterprise Hermes Agent"
            : "Cannot connect to Hermes Agent"}
        </h1>
        <p className="connection-error-lead">
          {managedMode
            ? owner === "opsi"
              ? "Managed by organization (OPSI). Hermes install, update, and Gateway lifecycle are handled by endpoint management. Retry after recovery completes."
              : "Managed by organization. Hermes install, update, and Gateway lifecycle are handled by Salt. Retry after Salt finishes installing or recovering the agent."
            : "SMC-Copilot needs a healthy local Hermes Agent Gateway. Retry after the managed runtime recovers."}
        </p>
        <ConnectionErrorDetails status={status} error={error} />
        <div className="connection-error-actions">
          <button
            type="button"
            className="primary"
            disabled={busy || connecting}
            onClick={() => void wrap(onReconnect)}
          >
            {connecting || busy ? "Connecting…" : "Retry"}
          </button>
          {!selfInstallUnreachable && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void wrap(onSelectHermesHome)}
            >
              Choose Hermes directory
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void wrap(onOpenLogs)}
          >
            Open Hermes logs
          </button>
          {!managedMode && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void wrap(onOpenConnectionSettings)}
            >
              Open connection settings
            </button>
          )}
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
