import { Copy, Download, Eye, ExternalLink, FolderOpen } from "lucide-react";
import { createPortal } from "react-dom";
import { useLightboxClose } from "../../../hooks/useLightboxClose";
import { useFileOperations } from "../../../hooks/files/useFileOperations";

export interface FileContextMenuProps {
  x: number;
  y: number;
  fileName: string;
  /** ManagedFile id — Open/Reveal/Save As are disabled without one (a plain
   * legacy `Attachment` has no File Platform id yet in Phase 1). */
  fileId?: string;
  profile?: string;
  onClose: () => void;
  onPreview?: () => void;
}

/**
 * Minimal context menu for a file: Preview, Open, Reveal, Save As, Copy
 * name. Open/Reveal/Save As call `hermesAPI.files.*` and require `fileId`;
 * without one they render disabled rather than being hidden, so the menu
 * shape stays predictable. Copy name always works.
 */
export function FileContextMenu({
  x,
  y,
  fileName,
  fileId,
  profile,
  onClose,
  onPreview,
}: FileContextMenuProps): React.JSX.Element {
  const ops = useFileOperations(profile);
  const hasManagedFile = !!fileId;
  useLightboxClose(true, onClose);

  const withClose = (fn: () => void | Promise<void>) => (): void => {
    void Promise.resolve(fn()).finally(onClose);
  };

  return createPortal(
    <div className="file-context-menu-backdrop" onClick={onClose}>
      <div
        className="file-context-menu"
        style={{ position: "fixed", top: y, left: x }}
        role="menu"
        aria-label={`${fileName} actions`}
        onClick={(e) => e.stopPropagation()}
      >
        {onPreview && (
          <button type="button" role="menuitem" onClick={withClose(onPreview)}>
            <Eye size={13} aria-hidden="true" />
            Preview
          </button>
        )}
        <button
          type="button"
          role="menuitem"
          disabled={!hasManagedFile}
          title={hasManagedFile ? undefined : "Not available for this attachment yet"}
          onClick={withClose(async () => {
            if (fileId) await ops.openExternal(fileId);
          })}
        >
          <ExternalLink size={13} aria-hidden="true" />
          Open
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={!hasManagedFile}
          title={hasManagedFile ? undefined : "Not available for this attachment yet"}
          onClick={withClose(async () => {
            if (fileId) await ops.revealInFolder(fileId);
          })}
        >
          <FolderOpen size={13} aria-hidden="true" />
          Reveal in folder
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={!hasManagedFile}
          title={hasManagedFile ? undefined : "Not available for this attachment yet"}
          onClick={withClose(async () => {
            if (fileId) await ops.saveAs(fileId);
          })}
        >
          <Download size={13} aria-hidden="true" />
          Save As…
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={withClose(() => window.hermesAPI.copyToClipboard(fileName))}
        >
          <Copy size={13} aria-hidden="true" />
          Copy name
        </button>
      </div>
    </div>,
    document.body,
  );
}

export default FileContextMenu;
