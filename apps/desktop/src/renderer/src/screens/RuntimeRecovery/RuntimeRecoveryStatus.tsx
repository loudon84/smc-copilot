import type { RuntimeConnectionState } from "../../../../shared/copilot-runtime/runtime-state-contract";
import type { StartupDecisionReason } from "../../../../shared/startup/startup-contract";

const STATE_TITLES: Record<string, string> = {
  Connecting: "Connecting to Runtime…",
  RuntimeStarting: "Starting local runtime…",
  RuntimeMissing: "Runtime Service unavailable",
  RuntimeDegraded: "Runtime requires attention",
  Incompatible: "Desktop / Runtime version mismatch",
  Ready: "Runtime ready",
};

export interface RuntimeRecoveryStatusProps {
  reason: StartupDecisionReason | string;
  runtimeState: RuntimeConnectionState | null;
  error?: string | null;
}

export function RuntimeRecoveryStatus({
  reason,
  runtimeState,
  error,
}: RuntimeRecoveryStatusProps): React.JSX.Element {
  const state = runtimeState?.state ?? "RuntimeMissing";
  const title = STATE_TITLES[state] ?? "Runtime recovery";
  const endpoint = runtimeState?.baseUrl ?? "—";

  return (
    <div className="runtime-recovery-status" data-testid="runtime-recovery-status">
      <h1 className="runtime-recovery-title">{title}</h1>
      <p className="runtime-recovery-subtitle">
        {state === "RuntimeStarting" || state === "Connecting"
          ? "SMC Copilot is connecting to the local Runtime Service."
          : state === "RuntimeMissing"
            ? "The Runtime Service is not reachable. Desktop does not install Hermes Agent."
            : state === "RuntimeDegraded"
              ? "Runtime Service is running, but one or more components require attention."
              : state === "Incompatible"
                ? "Update Runtime or Desktop so API versions match."
                : "Resolve Runtime connection before continuing."}
      </p>

      <dl className="runtime-recovery-meta">
        <div>
          <dt>Endpoint</dt>
          <dd>
            <code>{endpoint}</code>
          </dd>
        </div>
        <div>
          <dt>Reason</dt>
          <dd>
            <code>{reason}</code>
          </dd>
        </div>
        {runtimeState?.runtimeVersion ? (
          <div>
            <dt>Runtime</dt>
            <dd>
              {runtimeState.runtimeVersion} / API {runtimeState.runtimeApiVersion ?? "—"}
            </dd>
          </div>
        ) : null}
        {runtimeState?.hermesVersion ? (
          <div>
            <dt>Hermes</dt>
            <dd>{runtimeState.hermesVersion}</dd>
          </div>
        ) : null}
        {runtimeState?.compatibility ? (
          <div>
            <dt>Desktop API</dt>
            <dd>{runtimeState.compatibility.desktopApiVersion}</dd>
          </div>
        ) : null}
      </dl>

      {error ? (
        <p className="runtime-recovery-error" role="alert">
          {error}
        </p>
      ) : null}
      {runtimeState?.lastError ? (
        <p className="runtime-recovery-error" role="alert">
          {runtimeState.lastError}
          {runtimeState.lastErrorCode ? ` (${runtimeState.lastErrorCode})` : ""}
        </p>
      ) : null}
    </div>
  );
}
