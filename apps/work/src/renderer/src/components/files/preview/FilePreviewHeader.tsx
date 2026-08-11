import {
  Download,
  ExternalLink,
  FolderOpen,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import type { FilePreviewDescriptor } from "../../../../../shared/files";

export interface FilePreviewHeaderProps {
  descriptor?: FilePreviewDescriptor;
  fallbackTitle?: string;
  /** Message-document mode: hide open/reveal; Save As creates then saves. */
  messageMode?: boolean;
  maximized?: boolean;
  onToggleMaximized?: () => void;
  onOpenExternal: () => void;
  onReveal: () => void;
  onSaveAs: () => void;
  onClose: () => void;
  saveAsDisabled?: boolean;
}

/** Header row: file name/type badge on the left, file actions on the right. */
export function FilePreviewHeader({
  descriptor,
  fallbackTitle,
  messageMode = false,
  maximized = false,
  onToggleMaximized,
  onOpenExternal,
  onReveal,
  onSaveAs,
  onClose,
  saveAsDisabled,
}: FilePreviewHeaderProps): React.JSX.Element {
  const title = descriptor?.title || fallbackTitle || "Preview";
  const canOpenExternal = !messageMode && (descriptor?.canOpenExternal ?? false);
  const canSaveAs =
    saveAsDisabled === true
      ? false
      : messageMode
        ? true
        : (descriptor?.canSaveAs ?? false);

  return (
    <div className="file-preview-header">
      <div className="file-preview-header-title">
        {(descriptor?.type || messageMode) && (
          <span className="file-preview-type-badge">
            {descriptor?.type || "markdown"}
          </span>
        )}
        <span className="file-preview-filename" title={title}>
          {title}
        </span>
      </div>
      <div className="file-preview-actions">
        {!messageMode && (
          <button
            type="button"
            className="file-preview-btn"
            onClick={onReveal}
            disabled={!descriptor}
            title="Reveal in folder"
          >
            <FolderOpen size={15} />
          </button>
        )}
        <button
          type="button"
          className="file-preview-btn"
          onClick={onSaveAs}
          disabled={!canSaveAs}
          title={messageMode ? "Save as .md" : "Save As…"}
        >
          <Download size={15} />
        </button>
        {!messageMode && (
          <button
            type="button"
            className="file-preview-btn"
            onClick={onOpenExternal}
            disabled={!canOpenExternal}
            title="Open with default app"
          >
            <ExternalLink size={15} />
          </button>
        )}
        {onToggleMaximized && (
          <button
            type="button"
            className="file-preview-btn"
            onClick={onToggleMaximized}
            title={maximized ? "Restore preview" : "Maximize preview"}
            aria-label={maximized ? "Restore preview" : "Maximize preview"}
            aria-pressed={maximized}
          >
            {maximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        )}
        <button
          type="button"
          className="file-preview-btn"
          onClick={onClose}
          title="Close"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
