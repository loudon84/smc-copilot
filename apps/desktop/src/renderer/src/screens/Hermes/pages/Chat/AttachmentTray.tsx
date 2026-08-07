import { X } from "lucide-react";
import type { HermesChatAttachmentMeta } from "../../../../../../shared/hermes-default-chat/hermes-default-chat-contract";

export function AttachmentTray({
  attachments,
  onRemove,
}: {
  attachments: HermesChatAttachmentMeta[];
  onRemove: (id: string) => void;
}): React.JSX.Element | null {
  if (attachments.length === 0) return null;
  return (
    <div className="hermes-webchat-attachment-tray">
      {attachments.map((att) => (
        <span key={att.id} className="hermes-webchat-attachment-chip">
          <span className="hermes-webchat-attachment-name">{att.name}</span>
          <span className="hermes-webchat-attachment-meta">{Math.round(att.size_bytes / 1024)} KB</span>
          <button
            type="button"
            className="hermes-webchat-attachment-remove"
            onClick={() => void onRemove(att.id)}
            aria-label="Remove attachment"
          >
            <X size={12} />
          </button>
        </span>
      ))}
    </div>
  );
}

