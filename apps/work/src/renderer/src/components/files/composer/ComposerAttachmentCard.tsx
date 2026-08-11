import { Eye, RotateCcw, X } from "lucide-react";
import type { Attachment } from "../../../../../shared/attachments";
import { getFileExtension } from "../../../../../shared/attachments";
import {
  classifyFileCategory,
  isSendBlocked,
  type ManagedFileStatus,
} from "../../../../../shared/files";
import { FileBadge } from "../common/FileBadge";
import { FileIcon } from "../common/FileIcon";
import { ImageAttachmentPreview } from "../common/ImageAttachmentPreview";
import { FileProcessingStatus } from "./FileProcessingStatus";

export interface ComposerAttachmentCardProps {
  attachment: Attachment;
  /** Managed-file status, once the File Platform has staged/parsed this
   * attachment. Absent for plain legacy attachments (the common Phase 1
   * case) — the card then renders with no status row. */
  status?: ManagedFileStatus;
  onRemove?: () => void;
  onPreview?: (attachment: Attachment) => void;
  onRetry?: () => void;
}

/** Alias for callers that still use the Phase-1 name. */
export type AttachmentItemProps = ComposerAttachmentCardProps;

/**
 * One composer attachment card: icon, name, type·size, status, and
 * Preview/Retry/Remove actions. Images use ImageAttachmentPreview (no
 * legacy AttachmentChip dependency).
 */
export function ComposerAttachmentCard({
  attachment,
  status,
  onRemove,
  onPreview,
  onRetry,
}: ComposerAttachmentCardProps): React.JSX.Element {
  if (attachment.kind === "image") {
    return (
      <div className="attachment-item attachment-item-image">
        <ImageAttachmentPreview
          attachment={attachment}
          onRemove={onRemove}
          onPreview={onPreview}
        />
        {status && status !== "ready" && (
          <FileProcessingStatus status={status} compact className="attachment-item-image-status" />
        )}
      </div>
    );
  }

  const extension = getFileExtension(attachment.name);
  const category = classifyFileCategory(attachment.name, attachment.mime);
  const canRetry = !!onRetry && status === "failed";
  const blocked = status ? isSendBlocked(status) : false;

  return (
    <div className={`attachment-item attachment-item-file${blocked ? " attachment-item-blocked" : ""}`}>
      <div className="attachment-item-icon">
        <FileIcon category={category} size={20} />
      </div>
      <div className="attachment-item-body">
        <span className="attachment-item-name" title={attachment.name}>
          {attachment.name}
        </span>
        <FileBadge extension={extension} category={category} size={attachment.size} />
        {status && <FileProcessingStatus status={status} compact />}
      </div>
      <div className="attachment-item-actions">
        {onPreview && (
          <button
            type="button"
            className="attachment-item-action"
            onClick={() => onPreview(attachment)}
            title="Preview"
            aria-label={`Preview ${attachment.name}`}
          >
            <Eye size={13} />
          </button>
        )}
        {canRetry && (
          <button
            type="button"
            className="attachment-item-action"
            onClick={onRetry}
            title="Retry"
            aria-label={`Retry ${attachment.name}`}
          >
            <RotateCcw size={13} />
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            className="attachment-item-action attachment-item-remove"
            onClick={onRemove}
            title="Remove"
            aria-label={`Remove ${attachment.name}`}
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

/** @deprecated Prefer ComposerAttachmentCard — kept for barrel symbol stability. */
export const AttachmentItem = ComposerAttachmentCard;

export default ComposerAttachmentCard;
