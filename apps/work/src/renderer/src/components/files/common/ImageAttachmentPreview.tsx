import { Download, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import type { Attachment } from "../../../../../shared/attachments";
import { useLightboxClose } from "../../../hooks/useLightboxClose";
import { useI18n } from "../../useI18n";

export interface ImageAttachmentPreviewProps {
  attachment: Attachment;
  onRemove?: () => void;
  onPreview?: (attachment: Attachment) => void;
  className?: string;
}

/**
 * ManagedFile-friendly image thumb + lightbox. Used by Composer and message
 * cards so File Platform UI does not depend on legacy AttachmentChip.
 */
export function ImageAttachmentPreview({
  attachment,
  onRemove,
  onPreview,
  className,
}: ImageAttachmentPreviewProps): React.JSX.Element {
  const { t } = useI18n();
  const [zoomed, setZoomed] = useState(false);
  useLightboxClose(zoomed, () => setZoomed(false));
  const dataUrl = attachment.dataUrl;

  const showImageMenu = (event: React.MouseEvent): void => {
    if (!dataUrl) return;
    event.preventDefault();
    window.hermesAPI.showMediaMenu(dataUrl, attachment.name, {
      open: t("chat.media.open"),
      saveAs: t("chat.media.saveAs"),
    });
  };

  const previewImage = (): void => {
    if (!dataUrl) return;
    onPreview?.(attachment);
    setZoomed(true);
  };

  const tooltip =
    attachment.originalSize && attachment.originalSize > attachment.size
      ? `${attachment.name} (${formatSize(attachment.originalSize)} -> ${formatSize(attachment.size)}, compressed)`
      : `${attachment.name} (${formatSize(attachment.size)})`;

  return (
    <>
      <div
        className={`attachment-chip attachment-chip-image${className ? ` ${className}` : ""}`}
        title={tooltip}
      >
        {dataUrl ? (
          <button
            type="button"
            className="attachment-chip-thumb"
            onClick={previewImage}
            onContextMenu={showImageMenu}
            aria-label={attachment.name}
          >
            <img src={dataUrl} alt={attachment.name} />
          </button>
        ) : (
          <div className="attachment-chip-file">
            <span className="attachment-chip-name">{attachment.name}</span>
          </div>
        )}
        {onRemove && (
          <button
            type="button"
            className="attachment-chip-remove"
            onClick={onRemove}
            aria-label={`Remove ${attachment.name}`}
          >
            <X size={12} />
          </button>
        )}
      </div>
      {zoomed &&
        dataUrl &&
        createPortal(
          <div
            className="chat-image-preview-backdrop"
            role="dialog"
            aria-modal="true"
            onClick={() => setZoomed(false)}
          >
            <img
              className="chat-image-preview-image"
              src={dataUrl}
              alt={attachment.name}
              onClick={(e) => e.stopPropagation()}
              onContextMenu={showImageMenu}
            />
            <div
              className="chat-image-preview-actions"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="chat-image-preview-btn"
                onClick={() =>
                  window.hermesAPI.saveMediaFile(dataUrl, attachment.name)
                }
              >
                <Download size={14} />
                {t("chat.media.saveImage")}
              </button>
              <button
                className="chat-image-preview-btn"
                onClick={() => setZoomed(false)}
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default ImageAttachmentPreview;
