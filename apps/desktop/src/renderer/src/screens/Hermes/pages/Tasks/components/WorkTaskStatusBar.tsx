import { useTranslation } from "react-i18next";
import { useHermesDefault } from "../../../context/HermesDefaultContext";
import { HERMES_DEFAULT_PROFILE_META } from "../../../constants";

export function WorkTaskStatusBar() {
  const { t } = useTranslation();
  const { runtime, models, profile } = useHermesDefault();

  const gatewayLabel =
    runtime.status === "running"
      ? t("workspaces.hermes.runtime.running", { defaultValue: "Running" })
      : runtime.status;

  const modelLabel =
    models.active?.model ??
    runtime.modelConfig?.model ??
    t("workspaces.hermes.tasks.status.modelUnknown", { defaultValue: "—" });

  return (
    <div className="hermes-task-status-bar">
      <div className="hermes-status-card">
        <span className="hermes-status-card__label">Gateway</span>
        <strong>{gatewayLabel}</strong>
        <span className="hermes-status-card__meta">:{HERMES_DEFAULT_PROFILE_META.gatewayPort}</span>
      </div>
      <div className="hermes-status-card">
        <span className="hermes-status-card__label">Profile</span>
        <strong>{profile.profile?.displayName ?? HERMES_DEFAULT_PROFILE_META.displayName}</strong>
      </div>
      <div className="hermes-status-card">
        <span className="hermes-status-card__label">
          {t("workspaces.hermes.tasks.status.model", { defaultValue: "Model" })}
        </span>
        <strong>{modelLabel}</strong>
      </div>
      <div className="hermes-status-card">
        <span className="hermes-status-card__label">Expert MCP</span>
        <strong>{t("workspaces.hermes.tasks.status.expertMcp", { defaultValue: "Remote" })}</strong>
      </div>
    </div>
  );
}
