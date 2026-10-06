import { useI18n } from "../../components/useI18n";
import {
  isRemoteExpertCallable,
  type RemoteExpertCatalogItem,
} from "../../../../shared/remote-expert";
import type { AvailabilityStatus, CatalogStatus } from "./useRemoteExpertEntryState";

interface Props {
  selectedAgentRef: string | null;
  items: RemoteExpertCatalogItem[];
  availabilityStatus: AvailabilityStatus;
  catalogStatus: CatalogStatus;
  disabled?: boolean;
  onChange: (agentRef: string | null) => void;
}

export function RemoteExpertSelector({
  selectedAgentRef,
  items,
  availabilityStatus,
  catalogStatus,
  disabled,
  onChange,
}: Props) {
  const { t } = useI18n();
  const gateBlocked = availabilityStatus !== "compatible";
  const blocked = Boolean(disabled || gateBlocked);

  let title: string | undefined;
  if (availabilityStatus === "checking") {
    title = t("remoteExpert.checking");
  } else if (availabilityStatus === "incompatible") {
    title = t("remoteExpert.incompatible");
  } else if (availabilityStatus === "unavailable") {
    title = t("remoteExpert.unavailableEntry");
  } else if (catalogStatus === "empty") {
    title = t("remoteExpert.noExperts");
  } else if (catalogStatus === "error") {
    title = t("remoteExpert.catalogUnavailable");
  }

  return (
    <label className="remote-expert-selector" title={title}>
      <span className="sr-only">{t("remoteExpert.label")}</span>
      <select
        disabled={blocked}
        value={selectedAgentRef ?? ""}
        onChange={(event) => {
          const value = event.target.value;
          onChange(value ? value : null);
        }}
      >
        <option value="">{t("remoteExpert.localChat")}</option>
        {items.map((item) => (
          <option
            key={item.agentRef}
            value={item.agentRef}
            disabled={gateBlocked || !isRemoteExpertCallable(item)}
          >
            {item.displayName}
            {item.status === "unavailable"
              ? ` (${t("remoteExpert.unavailable")})`
              : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
