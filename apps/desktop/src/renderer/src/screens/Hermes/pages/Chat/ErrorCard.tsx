import { useI18n } from "../../../../components/useI18n";

export function ErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  return (
    <div className="hermes-webchat-error-card" role="alert">
      <p className="hermes-webchat-error-title">{message}</p>
      {onRetry ? (
        <button type="button" className="workspaces-action-button" onClick={() => void onRetry()}>
          {t("workspaces.hermes.chat.retry", { defaultValue: "Retry" })}
        </button>
      ) : null}
    </div>
  );
}

