import { useState } from "react";
import type { RuntimeConnectionState } from "../../../../shared/copilot-runtime/runtime-state-contract";
import { useCopilotRuntime } from "../../hooks/useCopilotRuntime";

export interface RuntimeRecoveryActionsProps {
  runtimeState: RuntimeConnectionState | null;
  onRetry: () => void;
  onEnterMain?: () => void;
}

export function RuntimeRecoveryActions({
  runtimeState,
  onRetry,
  onEnterMain,
}: RuntimeRecoveryActionsProps): React.JSX.Element {
  const { busy, error, retry, startPairing, confirmPairing, pairing, loadDiagnostics } =
    useCopilotRuntime();
  const [jobMessage, setJobMessage] = useState<string | null>(null);
  const [jobBusy, setJobBusy] = useState(false);

  const state = runtimeState?.state;
  const canRepair = runtimeState?.canRepair ?? true;
  const canPair = state === "PairingRequired" || runtimeState?.canPair;

  async function handleRepairRuntime(): Promise<void> {
    setJobBusy(true);
    setJobMessage(null);
    try {
      const result = await window.copilotRuntime.startRuntimeInstall();
      setJobMessage(
        result.jobId
          ? `Repair Runtime job started: ${result.jobId}`
          : result.message ?? "Repair Runtime job accepted",
      );
      onRetry();
    } catch (err) {
      setJobMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setJobBusy(false);
    }
  }

  async function handleDoctor(): Promise<void> {
    setJobBusy(true);
    setJobMessage(null);
    try {
      const result = await window.copilotRuntime.startRuntimeDoctor();
      setJobMessage(
        result.jobId ? `Doctor job started: ${result.jobId}` : result.message ?? "Doctor started",
      );
    } catch (err) {
      setJobMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setJobBusy(false);
    }
  }

  return (
    <div className="runtime-recovery-actions" data-testid="runtime-recovery-actions">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || jobBusy}
          onClick={() => {
            void retry().then(() => onRetry());
          }}
        >
          Retry Connection
        </button>

        {canRepair ? (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || jobBusy}
            onClick={() => void handleRepairRuntime()}
            data-testid="runtime-recovery-repair"
          >
            Repair Runtime
          </button>
        ) : null}

        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || jobBusy}
          onClick={() => void handleDoctor()}
        >
          Run Doctor
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || jobBusy}
          onClick={() => void loadDiagnostics()}
        >
          Open Diagnostics
        </button>

        {canPair ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || jobBusy}
            onClick={() => void startPairing()}
            data-testid="runtime-recovery-start-pairing"
          >
            Start Pairing
          </button>
        ) : null}

        {state === "RuntimeDegraded" && onEnterMain ? (
          <button type="button" className="btn btn-secondary" onClick={onEnterMain}>
            Continue to App
          </button>
        ) : null}
      </div>

      {pairing?.pairingId ? (
        <div className="runtime-recovery-pairing" style={{ marginTop: 16 }}>
          <p>
            Pairing ID: <code>{pairing.pairingId}</code>
          </p>
          {pairing.code ? (
            <p>
              Challenge: <code>{pairing.code}</code>
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void confirmPairing().then(() => onRetry())}
          >
            Confirm Pairing
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      ) : null}
      {jobMessage ? (
        <p style={{ marginTop: 12 }} data-testid="runtime-recovery-job-message">
          {jobMessage}
        </p>
      ) : null}
    </div>
  );
}
