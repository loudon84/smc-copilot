import { FileBox } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WorkArtifact } from "../../../model/artifact";

type Props = {
  artifacts: WorkArtifact[];
  onPreview: (artifact: WorkArtifact) => void;
  onOpenRun: (runId: string) => void;
  onViewAll: () => void;
};

export function RecentArtifacts({ artifacts, onPreview, onOpenRun, onViewAll }: Props) {
  const { t } = useTranslation();

  return (
    <article className="hermes-workbench-card">
      <h3>
        <FileBox size={16} /> {t("workspaces.hermes.workbench.recentArtifacts")}
      </h3>
      <ul className="hermes-workbench-list hermes-workbench-recommended-list">
        {artifacts.map((artifact) => (
          <li key={artifact.id} className="hermes-workbench-recommended-item">
            <div>
              <strong>{artifact.name}</strong>
              {artifact.source ? <span className="hermes-muted">{artifact.source}</span> : null}
            </div>
            <div className="hermes-workbench-recommended-item__actions">
              <button type="button" className="hermes-btn-ghost" onClick={() => onPreview(artifact)}>
                {t("workspaces.hermes.artifacts.preview")}
              </button>
              {artifact.runId ? (
                <button type="button" className="hermes-btn-ghost" onClick={() => onOpenRun(artifact.runId)}>
                  {t("workspaces.hermes.artifacts.openSourceRun", { defaultValue: "Open Source Run" })}
                </button>
              ) : null}
            </div>
          </li>
        ))}
        {artifacts.length === 0 ? (
          <li className="hermes-muted">{t("workspaces.hermes.artifacts.empty")}</li>
        ) : null}
      </ul>
      {artifacts.length > 0 ? (
        <div className="hermes-workbench-actions">
          <button type="button" className="hermes-btn-ghost" onClick={onViewAll}>
            {t("workspaces.hermes.workbench.viewAllArtifacts")}
          </button>
        </div>
      ) : null}
    </article>
  );
}
