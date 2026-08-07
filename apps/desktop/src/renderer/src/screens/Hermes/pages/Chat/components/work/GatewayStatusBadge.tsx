import type { ExpertGatewayStatus } from "../../../../types/work-chat";

const LABELS = {
  remote: "Remote",
  unavailable: "Unavailable",
  checking: "Checking…",
  error: "Error",
  unknown: "Gateway",
} as const;

type Props = {
  status: ExpertGatewayStatus;
};

export function GatewayStatusBadge({ status }: Props) {
  const label = LABELS[status] ?? LABELS.unknown;
  return (
    <span className={`hermes-work-gateway-badge is-${status}`} title="Expert Gateway">
      {label}
    </span>
  );
}
