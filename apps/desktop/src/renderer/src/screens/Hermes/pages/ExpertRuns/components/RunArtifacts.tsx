import { useTranslation } from "react-i18next";
import { useArtifactImport } from "../../../features/artifact/useArtifactImport";
import { useArtifactPreview } from "../../../features/artifact/useArtifactPreview";
import { workApi } from "../../../api/workApi";
import type { WorkArtifact } from "../../../model/artifact";
import { ArtifactImportDialog } from "../../Artifacts/components/ArtifactImportDialog";

type Props = {
  artifacts: WorkArtifact[];
  remoteTaskId?: string;
};

export function RunArtifacts({ artifacts, remoteTaskId }: Props) {
  const { t } = useTranslation();
  const { preview, previewArtifact } = useArtifactPreview();
  const { importTarget, importing, importResult, importError, openImport, closeImport, confirmImport } =
    useArtifactImport();

  if (artifacts.length === 0) return null;

  const handleDownload = async (artifactId: string) => {
    await workApi.artifacts.download(artifactId);
  };

  return (
    <section>
      <h4>{t("workspaces.hermes.expertRuns.artifacts")}</h4>
      <ul>
        {artifacts.map((artifact) => (
          <li key={artifact.id}>
            <strong>{artifact.name}</strong>
            <span>{artifact.type}</span>
            {artifact.previewText ? <pre>{artifact.previewText.slice(0, 500)}</pre> : null}
            <div className="hermes-run-detail__artifact-actions">
              <button
                type="button"
                className="hermes-btn-ghost"
                onClick={() => void previewArtifact(artifact)}
              >
                {t("workspaces.hermes.artifacts.preview", { defaultValue: "Preview" })}
              </button>
              <button
                type="button"
                className="hermes-btn-ghost"
                onClick={() => void handleDownload(artifact.id)}
              >
                {t("workspaces.hermes.artifacts.download", { defaultValue: "Download" })}
              </button>
              {remoteTaskId ? (
                <button
                  type="button"
                  className="hermes-btn-ghost"
                  onClick={() => openImport(artifact, remoteTaskId)}
                >
                  {t("workspaces.hermes.artifacts.import", { defaultValue: "Import" })}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {preview ? (
        <div className="hermes-artifact-preview">
          <pre>{preview.slice(0, 2000)}</pre>
        </div>
      ) : null}
      <ArtifactImportDialog
        target={importTarget}
        importing={importing}
        result={importResult}
        error={importError}
        onClose={closeImport}
        onConfirm={() => void confirmImport()}
      />
    </section>
  );
}
