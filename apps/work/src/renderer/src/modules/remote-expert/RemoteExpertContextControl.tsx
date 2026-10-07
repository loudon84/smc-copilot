import { useI18n } from "../../components/useI18n";
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
  const { t } = useI18n();
  const expired = props.session?.connectionState === "expired";
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
  const showRetry =
    props.availabilityStatus === "checking" ||
    props.availabilityStatus === "unavailable" ||
    props.availabilityStatus === "incompatible";
  const showRefresh =
    props.availabilityStatus === "compatible" &&
    (props.catalogStatus === "error" ||
      props.catalogStatus === "empty" ||
      props.catalogStatus === "ready");

  let statusText: string | null = null;
  if (props.availabilityStatus === "checking") {
    statusText = t("chat.remoteExpert.checking");
  } else if (props.availabilityStatus === "unavailable") {
    statusText = t("chat.remoteExpert.unavailableEntry");
  } else if (props.availabilityStatus === "incompatible") {
    statusText =
      mismatches.length > 0
        ? `${t("chat.remoteExpert.incompatible")} — ${t(
            "chat.remoteExpert.mismatchFields",
            { fields: mismatches.map((m) => m.field).join(", ") },
          )}`
        : t("chat.remoteExpert.incompatible");
  } else if (props.catalogStatus === "empty") {
    statusText = t("chat.remoteExpert.noExperts");
  } else if (props.catalogStatus === "error") {
    statusText = t("chat.remoteExpert.catalogUnavailable");
  } else if (expired) {
    statusText = t("chat.remoteExpert.sessionExpired");
  } else if (props.blocked) {
    statusText = t("chat.remoteExpert.resumeBlocked");
  } else if (props.session) {
    statusText = `${t("chat.remoteExpert.label")}: ${props.session.agentRef}`;
  } else if (props.selected) {
    statusText = `${t("chat.remoteExpert.label")}: ${props.selected.displayName}`;
  } else if (props.availabilityStatus === "compatible") {
    statusText = t("chat.remoteExpert.label");
  }

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
      {statusText ? <span title={mismatchTitle || undefined}>{statusText}</span> : null}
      {showRetry && props.onRetryAvailability ? (
        <button type="button" className="btn-ghost" onClick={props.onRetryAvailability}>
          {t("chat.remoteExpert.retry")}
        </button>
      ) : null}
      {showRefresh && props.onRefreshCatalog ? (
        <button type="button" className="btn-ghost" onClick={props.onRefreshCatalog}>
          {t("chat.remoteExpert.refreshCatalog")}
        </button>
      ) : null}
    </div>
  );
}
