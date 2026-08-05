import { RotateCcw, X } from "lucide-react";
import type { ManagedFileCategory, ManagedFileStatus } from "@shared/chat-files";
import { FileIcon } from "./FileIcon";
import { FileProcessingStatus } from "../composer/FileProcessingStatus";

export interface FileOperationCardProps {
  name: string;
  status: ManagedFileStatus;
  category?: ManagedFileCategory;
  /** FileError message/detail, when the failure came from the File Platform. */
  message?: string;
  onRetry?: () => void;
  onRemove?: () => void;
  className?: string;
}

/**
 * Status card for a file operation that needs attention — primarily
 * `failed` (retryable) and `missing` (the on-disk file vanished). Renders
 * for any status so callers can also use it as a generic "pending" tile.
 */
export function FileOperationCard({
  name,
  status,
  category,
  message,
  onRetry,
  onRemove,
  className,
}: FileOperationCardProps): React.JSX.Element {
  return (
    <div className={`file-operation-card file-operation-card-${status}${className ? ` ${className}` : ""}`}>
      <span className="file-operation-card-icon">
        <FileIcon category={category} name={name} size={18} />
      </span>
      <div className="file-operation-card-body">
        <span className="file-operation-card-name" title={name}>
          {name}
        </span>
        <FileProcessingStatus status={status} errorMessage={message} />
      </div>
      <div className="file-operation-card-actions">
        {onRetry && (status === "failed" || status === "missing") && (
          <button
            type="button"
            className="file-operation-card-action"
            onClick={onRetry}
            title="Retry"
            aria-label={`Retry ${name}`}
          >
            <RotateCcw size={13} />
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            className="file-operation-card-action"
            onClick={onRemove}
            title="Remove"
            aria-label={`Remove ${name}`}
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

export default FileOperationCard;
