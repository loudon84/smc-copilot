import type { Attachment } from "../../../../../shared/attachments";
import type { ManagedFileStatus } from "../../../../../shared/files";
import { ComposerAttachmentCard } from "./ComposerAttachmentCard";

export interface ComposerAttachmentTrayProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
  onPreview?: (attachment: Attachment) => void;
  onRetry?: (id: string) => void;
  /** Managed-file status keyed by attachment id, once available. */
  statusById?: Record<string, ManagedFileStatus>;
  className?: string;
}

/** Alias for callers that still use the Phase-1 name. */
export type AttachmentTrayProps = ComposerAttachmentTrayProps;

/** Horizontal tray of composer attachments — replaces the raw
 * `AttachmentChip` map in `ChatInput` with per-item status/retry support. */
export function ComposerAttachmentTray({
  attachments,
  onRemove,
  onPreview,
  onRetry,
  statusById,
  className,
}: ComposerAttachmentTrayProps): React.JSX.Element | null {
  if (attachments.length === 0) return null;
  return (
    <div className={`attachment-tray${className ? ` ${className}` : ""}`}>
      {attachments.map((attachment) => (
        <ComposerAttachmentCard
          key={attachment.id}
          attachment={attachment}
          status={statusById?.[attachment.id]}
          onRemove={() => onRemove(attachment.id)}
          onPreview={onPreview}
          onRetry={onRetry ? () => onRetry(attachment.id) : undefined}
        />
      ))}
    </div>
  );
}

/** @deprecated Prefer ComposerAttachmentTray — kept for barrel symbol stability. */
export const AttachmentTray = ComposerAttachmentTray;

export default ComposerAttachmentTray;
