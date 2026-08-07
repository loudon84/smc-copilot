import { useTranslation } from "react-i18next";

type Props = {
  preview: string | null;
  loading?: boolean;
  error?: string | null;
};

export function ArtifactPreviewPanel({ preview, loading, error }: Props) {
  const { t } = useTranslation();

  if (loading) {
    return <p className="hermes-page__loading">{t("workspaces.hermes.common.loading", { defaultValue: "Loading…" })}</p>;
  }

  if (error) {
    return <p className="hermes-page__error">{error}</p>;
  }

  if (!preview) return null;

  return (
    <div className="hermes-artifact-preview">
      <pre>{preview}</pre>
    </div>
  );
}
