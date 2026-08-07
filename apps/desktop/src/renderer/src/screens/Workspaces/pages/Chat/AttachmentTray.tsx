import { X } from "lucide-react";
import type { ChatAttachmentMeta } from "../../../../../../shared/workspace-chat/workspace-chat-contract";

export function AttachmentTray({
  attachments,
  onRemove,
}: {
  attachments: ChatAttachmentMeta[];
  onRemove: (id: string) => void;
}): React.JSX.Element | null {
  if (attachments.length === 0) return null;
  return (
    <div className="workspaces-webchat-attachment-tray">
      {attachments.map((att) => (
        <span key={att.id} className="workspaces-webchat-attachment-chip">
          <span className="workspaces-webchat-attachment-name">{att.name}</span>
          <span className="workspaces-webchat-attachment-meta">
            {Math.round(att.size_bytes / 1024)} KB
          </span>
          <button
            type="button"
            className="workspaces-webchat-attachment-remove"
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
