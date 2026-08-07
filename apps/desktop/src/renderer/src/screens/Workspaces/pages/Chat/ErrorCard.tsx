import { ProviderDetails } from "./ProviderDetails";

import { useI18n } from "../../../../components/useI18n";

export function ErrorCard({
  message,
  details,
  onRetry,
}: {
  message: string;
  details?: Record<string, unknown> | null;
  onRetry?: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  return (
    <div className="workspaces-webchat-error-card" role="alert">
      <p className="workspaces-webchat-error-title">{message}</p>
      {onRetry ? (
        <button type="button" className="workspaces-action-button" onClick={() => void onRetry()}>
          {t("workspaces.chat.retry", { defaultValue: "Retry" })}
        </button>
      ) : null}
      {details && Object.keys(details).length > 0 ? <ProviderDetails details={details} /> : null}
    </div>
  );
}
