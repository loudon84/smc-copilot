import { useI18n } from "../../components/useI18n";
import { RemoteExpertSelector } from "./RemoteExpertSelector";
import type { RemoteAcpSessionRef } from "../../../../shared/remote-expert";
import type { RemoteExpertCatalogItem } from "../../../../shared/remote-expert";
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
  errorCode?: string;
  disabled?: boolean;
  blocked?: boolean;
  onChange: (agentRef: string | null) => void;
  onRetryAvailability?: () => void;
  onRefreshCatalog?: () => void;
}) {
  const { t } = useI18n();
  const expired = props.session?.connectionState === "expired";
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
    statusText = t("remoteExpert.checking");
  } else if (props.availabilityStatus === "unavailable") {
    statusText = t("remoteExpert.unavailableEntry");
  } else if (props.availabilityStatus === "incompatible") {
    statusText = t("remoteExpert.incompatible");
  } else if (props.catalogStatus === "empty") {
    statusText = t("remoteExpert.noExperts");
  } else if (props.catalogStatus === "error") {
    statusText = t("remoteExpert.catalogUnavailable");
  } else if (expired) {
    statusText = t("remoteExpert.sessionExpired");
  } else if (props.blocked) {
    statusText = t("remoteExpert.resumeBlocked");
  } else if (props.session) {
    statusText = `${t("remoteExpert.label")}: ${props.session.agentRef}`;
  } else if (props.selected) {
    statusText = `${t("remoteExpert.label")}: ${props.selected.displayName}`;
  } else if (props.availabilityStatus === "compatible") {
    statusText = t("remoteExpert.label");
  }

  return (
    <div
      className="remote-expert-context"
      data-error-code={props.errorCode || undefined}
      data-availability={props.availabilityStatus}
      data-catalog={props.catalogStatus}
    >
      <RemoteExpertSelector
        selectedAgentRef={props.selectedAgentRef}
        items={props.items}
        availabilityStatus={props.availabilityStatus}
        catalogStatus={props.catalogStatus}
        disabled={props.disabled || props.blocked}
        onChange={props.onChange}
      />
      {statusText ? <span>{statusText}</span> : null}
      {showRetry && props.onRetryAvailability ? (
        <button type="button" className="btn-ghost" onClick={props.onRetryAvailability}>
          {t("remoteExpert.retry")}
        </button>
      ) : null}
      {showRefresh && props.onRefreshCatalog ? (
        <button type="button" className="btn-ghost" onClick={props.onRefreshCatalog}>
          {t("remoteExpert.refreshCatalog")}
        </button>
      ) : null}
    </div>
  );
}
