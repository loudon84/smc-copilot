import type { ReactNode } from "react";
import { useFileDrop } from "../../../hooks/files/useFileDrop";

export interface FileDropOverlayProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

/** Alias for callers that still use the Phase-1 name. */
export type FileDropZoneProps = FileDropOverlayProps;

/**
 * Wraps `children` with drag-and-drop file handling: a dashed border
 * overlay appears while a file drag hovers the zone, folders are rejected,
 * and dropped files are handed to `onFiles`. `onDrop` stops propagation so
 * a drop zone nested inside a larger droppable region (e.g. the
 * composer sitting inside `Chat.tsx`'s own drop overlay) only fires once.
 */
export function FileDropOverlay({
  onFiles,
  disabled,
  className,
  children,
}: FileDropOverlayProps): React.JSX.Element {
  const { active, handlers } = useFileDrop({ onFiles, disabled });

  return (
    <div
      className={`file-drop-zone${active ? " file-drop-zone-active" : ""}${
        className ? ` ${className}` : ""
      }`}
      onDragEnter={handlers.onDragEnter}
      onDragOver={handlers.onDragOver}
      onDragLeave={handlers.onDragLeave}
      onDrop={(e) => {
        handlers.onDrop(e);
        // Prevent an ancestor drop zone (e.g. Chat.tsx's chat-container) from
        // also processing this drop and double-ingesting the files.
        e.stopPropagation();
      }}
    >
      {children}
      {active && (
        <div className="file-drop-zone-overlay" aria-hidden="true">
          <span>Drop files to attach</span>
        </div>
      )}
    </div>
  );
}

/** @deprecated Prefer FileDropOverlay — kept for barrel symbol stability. */
export const FileDropZone = FileDropOverlay;

export default FileDropOverlay;
