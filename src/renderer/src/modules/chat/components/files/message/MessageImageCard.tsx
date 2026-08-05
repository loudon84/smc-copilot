import type { Attachment } from "../../../../../shared/attachments";
import { ImageAttachmentPreview } from "../common/ImageAttachmentPreview";

export interface MessageImageCardProps {
  attachment: Attachment;
  onPreview?: (attachment: Attachment) => void;
}

/** Read-only image card for message transcripts (thumbnail + lightbox). */
export function MessageImageCard({
  attachment,
  onPreview,
}: MessageImageCardProps): React.JSX.Element {
  return (
    <ImageAttachmentPreview attachment={attachment} onPreview={onPreview} />
  );
}

export default MessageImageCard;
