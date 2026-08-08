import { useCallback, useState } from "react";
import type { StartupDecision } from "../../../../shared/startup/startup-contract";
import type { RuntimePairAndConnectResult } from "../../../../shared/copilot-runtime";

export type PairingUiState = "idle" | "pairing" | "connecting" | "failed";

export interface RuntimePairingScreenProps {
  decision: StartupDecision | null;
  onComplete: () => void;
}

/**
 * Device Pairing screen (PRD v1.3.2).
 * Auth category — not Runtime Recovery. Renderer only calls pairAndConnect().
 */
export default function RuntimePairingScreen({
  decision,
  onComplete,
}: RuntimePairingScreenProps): React.JSX.Element {
  const [uiState, setUiState] = useState<PairingUiState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const runtime = decision?.runtimeState ?? null;
  const expired = errorCode === "PAIRING_EXPIRED";

  const handlePair = useCallback(async () => {
    if (!window.copilotRuntime?.pairAndConnect) {
      setUiState("failed");
      setError("pairAndConnect is unavailable");
      return;
    }
    setUiState("pairing");
    setError(null);
    setErrorCode(null);
    setWarning(null);

    let result: RuntimePairAndConnectResult;
    try {
      result = await window.copilotRuntime.pairAndConnect();
    } catch (err) {
      setUiState("failed");
      setError(err instanceof Error ? err.message : String(err));
      return;
    }

    if (result.ok && result.state.state === "Ready") {
      if (result.error?.code === "DEVICE_TOKEN_NOT_PERSISTED") {
        setWarning(result.error.message);
      }
      setUiState("connecting");
      onComplete();
      return;
    }

    setUiState("failed");
    setErrorCode(result.error?.code ?? result.state.lastErrorCode ?? "PAIRING_FAILED");
    setError(
      result.error?.message ??
        result.state.lastError ??
        "Pairing failed. Please try again.",
    );
  }, [onComplete]);

  const primaryLabel =
    uiState === "pairing"
      ? "Pairing…"
      : uiState === "connecting"
        ? "Connecting…"
        : expired
          ? "Pair Again"
          : "Pair & Continue";

  return (
    <div className="runtime-pairing-screen" data-testid="runtime-pairing-screen">
      <div className="runtime-pairing-card">
        <h1 className="runtime-pairing-title">Connect this Desktop</h1>
        <p className="runtime-pairing-subtitle">
          SMC Copilot Runtime is running. Authorize this Desktop once to continue.
        </p>

        <dl className="runtime-pairing-meta">
          <div>
            <dt>Runtime</dt>
            <dd>
              <code>{runtime?.baseUrl ?? "http://127.0.0.1:8765"}</code>
            </dd>
          </div>
          {runtime?.runtimeVersion ? (
            <div>
              <dt>Version</dt>
              <dd>{runtime.runtimeVersion}</dd>
            </div>
          ) : null}
          {runtime?.runtimeApiVersion || runtime?.compatibility?.desktopApiVersion ? (
            <div>
              <dt>API</dt>
              <dd>
                Runtime {runtime.runtimeApiVersion ?? "—"} / Desktop{" "}
                {runtime.compatibility?.desktopApiVersion ?? "—"}
              </dd>
            </div>
          ) : null}
        </dl>

        <p className="runtime-pairing-hint">Device authorization required</p>

        <div className="runtime-pairing-actions">
          <button
            type="button"
            className="btn btn-primary"
            data-testid="runtime-pairing-pair-and-continue"
            disabled={uiState === "pairing" || uiState === "connecting"}
            onClick={() => void handlePair()}
          >
            {primaryLabel}
          </button>
        </div>

        {uiState === "failed" && error ? (
          <p className="runtime-pairing-error" role="alert" data-testid="runtime-pairing-error">
            {error}
          </p>
        ) : null}

        {warning ? (
          <p className="runtime-pairing-warning" role="status">
            {warning}
          </p>
        ) : null}

        <p className="runtime-pairing-footnote">
          This authorization is required only once for this Desktop.
        </p>
      </div>

      <style>{`
        .runtime-pairing-screen {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: var(--bg-primary, #0f1115);
          color: var(--text-primary, #e8eaed);
        }
        .runtime-pairing-card {
          max-width: 520px;
          width: 100%;
          border: 1px solid var(--border-color, #2a2f3a);
          border-radius: 12px;
          padding: 28px 24px;
          background: var(--bg-secondary, #161a22);
        }
        .runtime-pairing-title {
          margin: 0 0 8px;
          font-size: 1.4rem;
        }
        .runtime-pairing-subtitle {
          margin: 0 0 16px;
          opacity: 0.85;
          line-height: 1.5;
        }
        .runtime-pairing-meta {
          display: grid;
          gap: 8px;
          margin: 0 0 16px;
        }
        .runtime-pairing-meta dt {
          font-size: 0.75rem;
          opacity: 0.65;
        }
        .runtime-pairing-meta dd {
          margin: 0;
        }
        .runtime-pairing-hint {
          margin: 0 0 16px;
          opacity: 0.8;
        }
        .runtime-pairing-actions {
          display: flex;
          gap: 8px;
        }
        .runtime-pairing-error {
          margin-top: 12px;
          color: #fbbf24;
        }
        .runtime-pairing-warning {
          margin-top: 12px;
          opacity: 0.85;
        }
        .runtime-pairing-footnote {
          margin: 20px 0 0;
          font-size: 0.85rem;
          opacity: 0.65;
        }
      `}</style>
    </div>
  );
}
