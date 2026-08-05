import type { Attachment } from "../../../../../shared/attachments";
import { MessageAttachmentCard } from "./MessageAttachmentCard";

export interface MessageAttachmentGridProps {
  attachments: Attachment[];
  onPreview?: (attachment: Attachment) => void;
  className?: string;
}

/** Grid of a message's attachments — read-only (no remove button). Replaces
 * the raw `AttachmentChip` map in `MessageRow` for both user and assistant
 * bubbles; image click-to-preview behavior is unchanged. */
export function MessageAttachmentGrid({
  attachments,
  onPreview,
  className,
}: MessageAttachmentGridProps): React.JSX.Element | null {
  if (attachments.length === 0) return null;
  return (
    <div className={`message-attachment-grid${className ? ` ${className}` : ""}`}>
      {attachments.map((attachment) => (
        <MessageAttachmentCard
          key={attachment.id}
          attachment={attachment}
          onPreview={onPreview}
        />
      ))}
    </div>
  );
}

export default MessageAttachmentGrid;
