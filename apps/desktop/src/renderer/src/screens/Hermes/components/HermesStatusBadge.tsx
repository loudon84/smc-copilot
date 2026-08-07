import type { HermesGatewayUiStatus } from "../types";

const LABELS: Record<HermesGatewayUiStatus, string> = {
  running: "Running",
  stopped: "Stopped",
  starting: "Starting",
  stopping: "Stopping",
  error: "Error",
};

export function HermesStatusBadge({ status }: { status: HermesGatewayUiStatus }) {
  return <span className={`hermes-badge hermes-badge--${status}`}>{LABELS[status]}</span>;
}
