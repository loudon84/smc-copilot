import { X } from "lucide-react";
import AgentMarkdown from "../../../../../../components/AgentMarkdown";
import type { ExpertTaskArtifactView } from "../../../../types/expert-task-stream";

type Props = {
  taskId?: string;
  artifacts: ExpertTaskArtifactView[];
  selectedArtifact?: ExpertTaskArtifactView | null;
  previewContent?: string | null;
  previewLoading?: boolean;
  onClose?: () => void;
  onSelectArtifact?: (artifact: ExpertTaskArtifactView) => void;
};

export function WorkExpertOutputPanel({
  artifacts,
  selectedArtifact,
  previewContent,
  previewLoading,
  onClose,
  onSelectArtifact,
}: Props) {
  if (!selectedArtifact && artifacts.length === 0) return null;

  const isJson =
    selectedArtifact?.mimeType?.includes("json") ||
    (previewContent?.trim().startsWith("{") ?? false);

  return (
    <aside className="hermes-expert-output-panel" aria-label="Expert output">
      <div className="hermes-expert-output-panel__header">
        <p className="hermes-expert-output-panel__title">Runtime Output</p>
        <button type="button" className="hermes-btn hermes-btn--ghost" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
      </div>

      {artifacts.length > 0 ? (
        <ul className="hermes-expert-output-panel__artifact-list">
          {artifacts.map((artifact) => (
            <li key={`${artifact.taskId}-${artifact.artifactId ?? artifact.artifactUrl ?? artifact.name}`}>
              <button
                type="button"
                className={
                  selectedArtifact?.artifactUrl === artifact.artifactUrl &&
                  selectedArtifact?.artifactId === artifact.artifactId
                    ? "hermes-expert-output-panel__artifact is-active"
                    : "hermes-expert-output-panel__artifact"
                }
                onClick={() => onSelectArtifact?.(artifact)}
              >
                {artifact.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="hermes-expert-output-panel__preview">
        {previewLoading ? <p className="hermes-muted">Loading preview…</p> : null}
        {!previewLoading && previewContent ? (
          isJson ? (
            <pre className="hermes-expert-output-panel__json">{previewContent}</pre>
          ) : (
            <AgentMarkdown>{previewContent}</AgentMarkdown>
          )
        ) : null}
        {!previewLoading && !previewContent && selectedArtifact ? (
          <p className="hermes-muted">No preview content.</p>
        ) : null}
      </div>
    </aside>
  );
}
