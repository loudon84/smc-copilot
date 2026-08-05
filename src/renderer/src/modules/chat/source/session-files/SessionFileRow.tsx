import { BookmarkMinus, BookmarkPlus, Eye } from "lucide-react";
import type { ManagedFileView } from "@shared/chat-files";
import { FileIcon } from "../../../components/files/common/FileIcon";
import { FileStatusIndicator } from "../../../components/files/composer/FileProcessingStatus";

export interface SessionFileRowProps {
  file: ManagedFileView;
  inContext: boolean;
  onPreview?: (fileId: string) => void;
  onAddContext?: (fileId: string) => void;
  onRemoveContext?: (fileId: string) => void;
}

/** One row in the Session Files panel (name, status, preview/context actions). */
export function SessionFileRow({
  file,
  inContext,
  onPreview,
  onAddContext,
  onRemoveContext,
}: SessionFileRowProps): React.JSX.Element {
  return (
    <div className="session-files-item">
      <FileIcon category={file.category} name={file.name} size={16} />
      <button
        type="button"
        className="session-files-item-name"
        title={file.name}
        onClick={() => onPreview?.(file.id)}
      >
        {file.name}
      </button>
      <FileStatusIndicator status={file.status} />
      <div className="session-files-item-actions">
        {onPreview && (
          <button
            type="button"
            className="session-files-item-action"
            title="Preview"
            aria-label={`Preview ${file.name}`}
            onClick={() => onPreview(file.id)}
          >
            <Eye size={12} />
          </button>
        )}
        {inContext
          ? onRemoveContext && (
              <button
                type="button"
                className="session-files-item-action"
                title="Remove from context"
                aria-label={`Remove ${file.name} from context`}
                onClick={() => onRemoveContext(file.id)}
              >
                <BookmarkMinus size={12} />
              </button>
            )
          : onAddContext && (
              <button
                type="button"
                className="session-files-item-action"
                title="Add to context"
                aria-label={`Add ${file.name} to context`}
                onClick={() => onAddContext(file.id)}
              >
                <BookmarkPlus size={12} />
              </button>
            )}
      </div>
    </div>
  );
}

export default SessionFileRow;
