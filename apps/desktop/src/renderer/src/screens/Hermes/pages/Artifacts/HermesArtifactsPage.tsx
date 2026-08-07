import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { workApi } from "../../api/workApi";
import { useNavigateToRun } from "../../features/expert-call/useNavigateToRun";
import { useArtifactPreview } from "../../features/artifact/useArtifactPreview";
import { useLocalArtifacts } from "../../features/artifact/useLocalArtifacts";
import { ArtifactList } from "./components/ArtifactList";
import { ArtifactPreviewPanel } from "./components/ArtifactPreviewPanel";

export default function HermesArtifactsPage() {
  const { t } = useTranslation();
  const navigateToRun = useNavigateToRun();
  const { artifacts, loading, error, refresh } = useLocalArtifacts(50);
  const { preview, loading: previewLoading, error: previewError, previewArtifact } = useArtifactPreview();

  const handleDownload = async (artifactId: string) => {
    await workApi.artifacts.download(artifactId);
  };

  return (
    <div className="hermes-page hermes-artifacts-page">
      <header className="hermes-page__header">
        <div>
          <h2>{t("workspaces.hermes.artifacts.title", { defaultValue: "Artifacts" })}</h2>
          <p className="hermes-page__subtitle">
            {t("workspaces.hermes.artifacts.subtitle", {
              defaultValue: "Preview, download, and import local expert responses",
            })}
          </p>
        </div>
        <button type="button" className="hermes-btn-ghost" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "hermes-spin" : undefined} />
          {t("workspaces.hermes.common.refresh", { defaultValue: "Refresh" })}
        </button>
      </header>

      {error ? <p className="hermes-page__error">{error}</p> : null}

      {loading && artifacts.length === 0 ? (
        <p className="hermes-page__loading">{t("workspaces.hermes.common.loading", { defaultValue: "Loading…" })}</p>
      ) : null}

      {!loading && artifacts.length === 0 ? (
        <p className="hermes-page__empty">{t("workspaces.hermes.artifacts.empty", { defaultValue: "No artifacts yet" })}</p>
      ) : null}

      <ArtifactList
        artifacts={artifacts}
        onPreview={(artifact) => void previewArtifact(artifact)}
        onDownload={handleDownload}
        onOpenSourceRun={navigateToRun}
      />

      <ArtifactPreviewPanel preview={preview} loading={previewLoading} error={previewError} />
    </div>
  );
}
