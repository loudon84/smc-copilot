import { Download, Eye, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WorkArtifact } from "../../../model/artifact";

type Props = {
  artifacts: WorkArtifact[];
  onPreview: (artifact: WorkArtifact) => void;
  onDownload: (artifactId: string) => void;
  onOpenSourceRun?: (runId: string) => void;
};

export function ArtifactList({ artifacts, onPreview, onDownload, onOpenSourceRun }: Props) {
  const { t } = useTranslation();

  return (
    <ul className="hermes-artifact-list">
      {artifacts.map((artifact) => (
        <li key={artifact.id} className="hermes-artifact-row">
          <div>
            <strong>{artifact.name}</strong>
            {artifact.source ? <span className="hermes-muted">{artifact.source}</span> : null}
          </div>
          <div className="hermes-artifact-row__actions">
            <button type="button" className="hermes-btn-ghost" onClick={() => onPreview(artifact)}>
              <Eye size={14} /> {t("workspaces.hermes.artifacts.preview", { defaultValue: "Preview" })}
            </button>
            <button type="button" className="hermes-btn-ghost" onClick={() => void onDownload(artifact.id)}>
              <Download size={14} /> {t("workspaces.hermes.artifacts.download", { defaultValue: "Download" })}
            </button>
            {onOpenSourceRun && artifact.runId ? (
              <button
                type="button"
                className="hermes-btn-ghost"
                onClick={() => onOpenSourceRun(artifact.runId)}
              >
                <ExternalLink size={14} />{" "}
                {t("workspaces.hermes.artifacts.openSourceRun", { defaultValue: "Open Source Run" })}
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
