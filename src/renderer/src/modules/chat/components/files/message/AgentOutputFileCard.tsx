import { Eye, FolderOpen, ExternalLink, FileWarning } from "lucide-react";
import { FileIcon } from "../common/FileIcon";
import { classifyFileCategory } from "@shared/chat-files";

export interface AgentOutputFileCardProps {
  path: string;
  name?: string;
  exists?: boolean;
  onPreview?: () => void;
  onOpen?: () => void;
  onReveal?: () => void;
}

/**
 * Card for a non-image file path surfaced in an agent message.
 * Shows a missing-state UI when `exists === false`; does not auto-register paths.
 */
// @lat: [[file-ui-components#Agent output card]]
export function AgentOutputFileCard({
  path,
  name,
  exists = true,
  onPreview,
  onOpen,
  onReveal,
}: AgentOutputFileCardProps): React.JSX.Element {
  const displayName = name || path.split(/[\\/]/).filter(Boolean).pop() || path;
  const category = classifyFileCategory(displayName);
  const missing = exists === false;

  return (
    <div
      className={`agent-output-file-card${missing ? " agent-output-file-card-missing" : ""}`}
      title={path}
    >
      <span className="agent-output-file-card-icon">
        {missing ? (
          <FileWarning size={18} aria-hidden />
        ) : (
          <FileIcon category={category} name={displayName} size={18} />
        )}
      </span>
      <div className="agent-output-file-card-body">
        <span className="agent-output-file-card-name">{displayName}</span>
        <span className="agent-output-file-card-meta">
          {missing ? "File not found" : path}
        </span>
      </div>
      <div className="agent-output-file-card-actions">
        {onPreview && !missing && (
          <button
            type="button"
            className="agent-output-file-card-action"
            title="Preview"
            aria-label={`Preview ${displayName}`}
            onClick={onPreview}
          >
            <Eye size={13} />
          </button>
        )}
        {onOpen && !missing && (
          <button
            type="button"
            className="agent-output-file-card-action"
            title="Open"
            aria-label={`Open ${displayName}`}
            onClick={onOpen}
          >
            <ExternalLink size={13} />
          </button>
        )}
        {onReveal && !missing && (
          <button
            type="button"
            className="agent-output-file-card-action"
            title="Reveal in folder"
            aria-label={`Reveal ${displayName}`}
            onClick={onReveal}
          >
            <FolderOpen size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

export default AgentOutputFileCard;
