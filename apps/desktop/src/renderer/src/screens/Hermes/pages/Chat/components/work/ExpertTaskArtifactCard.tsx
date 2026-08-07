import { Download, Eye } from "lucide-react";

type Props = {
  artifactId?: string;
  artifactUrl?: string;
  name: string;
  mimeType?: string;
  onPreview?: () => void;
  onDownload?: () => void;
};

export function ExpertTaskArtifactCard({
  name,
  mimeType,
  onPreview,
  onDownload,
}: Props) {
  return (
    <div className="hermes-expert-artifact-card">
      <div className="hermes-expert-artifact-card__info">
        <p className="hermes-expert-artifact-card__name">{name}</p>
        {mimeType ? <p className="hermes-expert-artifact-card__mime">{mimeType}</p> : null}
      </div>
      <div className="hermes-expert-artifact-card__actions">
        <button type="button" className="hermes-btn hermes-btn--ghost" onClick={onPreview}>
          <Eye size={14} />
          Preview
        </button>
        <button type="button" className="hermes-btn hermes-btn--ghost" onClick={onDownload}>
          <Download size={14} />
          Download
        </button>
      </div>
    </div>
  );
}
