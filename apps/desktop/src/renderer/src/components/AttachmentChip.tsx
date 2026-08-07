import { FileText, Image as ImageIcon, Paperclip, X } from "lucide-react";
import type { Attachment } from "../../../shared/attachments";

export interface AttachmentChipProps {
  attachment: Attachment;
  onRemove?: () => void;
  onPreview?: (attachment: Attachment) => void;
}

function kindIcon(kind: Attachment["kind"]): React.JSX.Element {
  if (kind === "image") return <ImageIcon className="h-3.5 w-3.5 shrink-0" />;
  if (kind === "text-file") return <FileText className="h-3.5 w-3.5 shrink-0" />;
  return <Paperclip className="h-3.5 w-3.5 shrink-0" />;
}

export function AttachmentChip({
  attachment,
  onRemove,
  onPreview,
}: AttachmentChipProps): React.JSX.Element {
  const clickable =
    attachment.kind === "image" && Boolean(onPreview) && Boolean(attachment.dataUrl);

  return (
    <span className="inline-flex max-w-[200px] items-center gap-1 rounded-md border border-gray-700 bg-gray-800/80 px-2 py-0.5 text-xs text-gray-200">
      <button
        type="button"
        className={`inline-flex min-w-0 items-center gap-1 ${clickable ? "cursor-pointer hover:text-white" : "cursor-default"}`}
        onClick={() => {
          if (clickable) onPreview?.(attachment);
        }}
        disabled={!clickable}
        title={attachment.name}
      >
        {kindIcon(attachment.kind)}
        <span className="truncate">{attachment.name}</span>
      </button>
      {onRemove ? (
        <button
          type="button"
          className="shrink-0 text-gray-500 hover:text-gray-200"
          onClick={onRemove}
          aria-label="Remove attachment"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}
