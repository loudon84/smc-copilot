import { useState } from "react";
import { useI18n } from "../../../../components/useI18n";

export function ProviderDetails({
  details,
}: {
  details: Record<string, unknown>;
}): React.JSX.Element {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="workspaces-webchat-provider-details">
      <button type="button" className="workspaces-link-button" onClick={() => setOpen((v) => !v)}>
        {open
          ? t("workspaces.chat.hideDetails", { defaultValue: "Hide details" })
          : t("workspaces.chat.showDetails", { defaultValue: "Provider details" })}
      </button>
      {open ? (
        <pre className="workspaces-webchat-error-details">
          {JSON.stringify(details, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
