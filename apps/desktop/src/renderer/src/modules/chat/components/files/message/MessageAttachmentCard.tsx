import type { Attachment } from "../../../../../shared/attachments";
import { getFileExtension } from "../../../../../shared/attachments";
import { classifyFileCategory } from "@shared/chat-files";
import { FileBadge } from "../common/FileBadge";
import { FileIcon } from "../common/FileIcon";
import { MessageImageCard } from "./MessageImageCard";

export interface MessageAttachmentCardProps {
  attachment: Attachment;
  onPreview?: (attachment: Attachment) => void;
}

/**
 * One message-transcript attachment — no remove button (messages are
 * immutable history). Images delegate to `MessageImageCard`; everything
 * else gets a compact file card that opens `onPreview` on click.
 */
export function MessageAttachmentCard({
  attachment,
  onPreview,
}: MessageAttachmentCardProps): React.JSX.Element {
  if (attachment.kind === "image") {
    return <MessageImageCard attachment={attachment} onPreview={onPreview} />;
  }

  const extension = getFileExtension(attachment.name);
  const category = classifyFileCategory(attachment.name, attachment.mime);
  const clickable = !!onPreview;

  return (
    <button
      type="button"
      className="message-attachment-card"
      onClick={clickable ? () => onPreview(attachment) : undefined}
      disabled={!clickable}
      title={attachment.name}
    >
      <span className="message-attachment-card-icon">
        <FileIcon category={category} size={18} />
      </span>
      <span className="message-attachment-card-body">
        <span className="message-attachment-card-name">{attachment.name}</span>
        <FileBadge extension={extension} category={category} size={attachment.size} />
      </span>
    </button>
  );
}

export default MessageAttachmentCard;
