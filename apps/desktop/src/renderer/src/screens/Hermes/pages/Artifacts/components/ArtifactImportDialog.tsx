import { useTranslation } from "react-i18next";
import type { ArtifactImportTarget } from "../../../features/artifact/useArtifactImport";

type Props = {
  target: ArtifactImportTarget | null;
  importing: boolean;
  result: string | null;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function ArtifactImportDialog({ target, importing, result, error, onClose, onConfirm }: Props) {
  const { t } = useTranslation();

  if (!target) return null;

  return (
    <div className="hermes-dialog-overlay" role="dialog" aria-modal="true">
      <div className="hermes-dialog">
        <header>
          <h3>{t("workspaces.hermes.artifacts.import", { defaultValue: "Import" })}</h3>
        </header>
        <p>
          {t("workspaces.hermes.artifacts.importConfirm", {
            defaultValue: "Import {{name}} to local workspace?",
            name: target.artifact.name,
          })}
        </p>
        {result ? <p className="hermes-muted">{result}</p> : null}
        {error ? <p className="hermes-page__error">{error}</p> : null}
        <footer className="hermes-dialog__actions">
          <button type="button" className="hermes-btn-ghost" onClick={onClose} disabled={importing}>
            {t("workspaces.hermes.common.cancel", { defaultValue: "Cancel" })}
          </button>
          <button type="button" className="hermes-btn-primary" onClick={onConfirm} disabled={importing}>
            {importing
              ? t("workspaces.hermes.common.loading", { defaultValue: "Loading…" })
              : t("workspaces.hermes.artifacts.import", { defaultValue: "Import" })}
          </button>
        </footer>
      </div>
    </div>
  );
}
