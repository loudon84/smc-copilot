import { useTranslation } from "react-i18next";
import { HERMES_DEFAULT_PROFILE_META } from "../../../constants";
import { useHermesExpertsCatalog } from "../../../context/HermesExpertsContext";
import { useHermesWorkspace } from "../../../context/HermesWorkspaceContext";

export function HermesActiveExpertBar() {
  const { t } = useTranslation();
  const workspace = useHermesWorkspace();
  const { getExpertById, getTeamById } = useHermesExpertsCatalog();

  let label: string = HERMES_DEFAULT_PROFILE_META.displayName;
  if (workspace.mode === "expert" && workspace.activeExpertId) {
    label = getExpertById(workspace.activeExpertId)?.displayName ?? workspace.activeProfileId;
  } else if (workspace.mode === "team" && workspace.activeTeamId) {
    label = getTeamById(workspace.activeTeamId)?.displayName ?? workspace.activeProfileId;
  }

  return (
    <div className="hermes-active-expert-bar">
      <span className="hermes-muted">{t("workspaces.hermes.chat.activeObject")}</span>
      <strong>{label}</strong>
      {workspace.mode !== "default" ? (
        <button type="button" className="hermes-btn-ghost" onClick={() => workspace.resetToDefault()}>
          {t("workspaces.hermes.chat.backToDefault")}
        </button>
      ) : null}
      <div className="hermes-work-mode-tabs" role="tablist" aria-label="Work mode">
        {(["ask", "plan", "craft"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            role="tab"
            className={workspace.workMode === mode ? "is-active" : undefined}
            onClick={() => workspace.setWorkMode(mode)}
          >
            {t(`workspaces.hermes.chat.workMode.${mode}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
