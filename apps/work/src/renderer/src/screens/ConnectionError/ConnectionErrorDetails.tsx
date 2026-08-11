import type { HermesRuntimeProbe } from "../../../../shared/runtime/runtime-contract";

interface ConnectionErrorDetailsProps {
  status: HermesRuntimeProbe | null;
  error: string | null;
  probedAt?: number;
}

function ConnectionErrorDetails({
  status,
  error,
  probedAt,
}: ConnectionErrorDetailsProps): React.JSX.Element {
  const ts = probedAt || status?.probedAt;
  const checkedAt = ts ? new Date(ts).toLocaleString() : "—";

  return (
    <dl className="connection-error-details">
      <div>
        <dt>Connection state</dt>
        <dd>{status?.state ?? "unknown"}</dd>
      </div>
      <div>
        <dt>Error</dt>
        <dd>{error || status?.errorMessage || status?.errorCode || "—"}</dd>
      </div>
      <div>
        <dt>Hermes Home</dt>
        <dd className="mono">{status?.homePath || "—"}</dd>
      </div>
      <div>
        <dt>Gateway endpoint</dt>
        <dd className="mono">{status?.endpoint || "—"}</dd>
      </div>
      <div>
        <dt>Profile</dt>
        <dd>{status?.profile || "default"}</dd>
      </div>
      <div>
        <dt>Hermes version</dt>
        <dd>{status?.version || "—"}</dd>
      </div>
      <div>
        <dt>Last checked</dt>
        <dd>{checkedAt}</dd>
      </div>
    </dl>
  );
}

export default ConnectionErrorDetails;
