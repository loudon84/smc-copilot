import { RemoteExpertSelector } from "./RemoteExpertSelector";
import type {
  RemoteAcpSessionRef,
  RemoteExpertAvailability,
  RemoteExpertCatalogItem,
} from "../../../../shared/remote-expert";
import type {
  AvailabilityStatus,
  CatalogStatus,
} from "./useRemoteExpertEntryState";

export function RemoteExpertContextControl(props: {
  selectedAgentRef: string | null;
  selected: RemoteExpertCatalogItem | null;
  session: RemoteAcpSessionRef | null;
  items: RemoteExpertCatalogItem[];
  availabilityStatus: AvailabilityStatus;
  catalogStatus: CatalogStatus;
  availability?: RemoteExpertAvailability | null;
  errorCode?: string;
  disabled?: boolean;
  blocked?: boolean;
  onChange: (agentRef: string | null) => void;
  onRetryAvailability?: () => void;
  onRefreshCatalog?: () => void;
}) {
  const mismatches = props.availability?.mismatches ?? [];
  const mismatchTitle =
    mismatches.length > 0
      ? mismatches
          .map(
            (m) =>
              `${m.field}: expected ${String(m.expected)}, got ${String(m.observed)}`,
          )
          .join("\n")
      : props.availability?.reason;

  return (
    <div
      className="remote-expert-context"
      data-error-code={props.errorCode || undefined}
      data-availability={props.availabilityStatus}
      data-catalog={props.catalogStatus}
      data-mismatch-fields={
        mismatches.length > 0
          ? mismatches.map((m) => m.field).join(",")
          : undefined
      }
      title={mismatchTitle || undefined}
    >
      <RemoteExpertSelector
        selectedAgentRef={props.selectedAgentRef}
        items={props.items}
        availabilityStatus={props.availabilityStatus}
        catalogStatus={props.catalogStatus}
        disabled={props.disabled || props.blocked}
        onChange={props.onChange}
      />
    </div>
  );
}
