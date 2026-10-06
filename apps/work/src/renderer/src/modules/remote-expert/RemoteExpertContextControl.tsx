import { useI18n } from "../../components/useI18n";
import { RemoteExpertSelector } from "./RemoteExpertSelector";
import type { RemoteAcpSessionRef } from "../../../../shared/remote-expert";
import type { RemoteExpertCatalogItem } from "../../../../shared/remote-expert";

export function RemoteExpertContextControl(props: {
  selected: RemoteExpertCatalogItem | null;
  session: RemoteAcpSessionRef | null;
  disabled?: boolean;
  blocked?: boolean;
  gateUnavailable?: boolean;
  onChange: (item: RemoteExpertCatalogItem | null) => void;
}) {
  const { t } = useI18n();
  const expired = props.session?.connectionState === "expired";
  return (
    <div className="remote-expert-context">
      <RemoteExpertSelector
        selected={props.selected}
        disabled={props.disabled || props.blocked}
        gateUnavailable={props.gateUnavailable}
        onChange={props.onChange}
      />
      {props.gateUnavailable ? (
        <span>{t("remoteExpert.gateUnavailable")}</span>
      ) : expired ? (
        <span>{t("remoteExpert.sessionExpired")}</span>
      ) : props.blocked ? (
        <span>{t("remoteExpert.resumeBlocked")}</span>
      ) : props.session ? (
        <span>
          {t("remoteExpert.label")}: {props.session.agentRef}
        </span>
      ) : props.selected ? (
        <span>
          {t("remoteExpert.label")}: {props.selected.displayName}
        </span>
      ) : null}
    </div>
  );
}
