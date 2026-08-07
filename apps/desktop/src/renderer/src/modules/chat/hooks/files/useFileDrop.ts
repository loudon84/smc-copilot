import { useCallback, useRef, useState } from "react";

export interface UseFileDropOptions {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  /** Drop directory entries silently (default true) — a folder dragged from
   * Finder/Explorer surfaces as a zero-byte `File` that nothing downstream
   * can read, so it's filtered out rather than passed to `onFiles`. */
  rejectFolders?: boolean;
}

export interface UseFileDropResult {
  /** True while a file drag is hovering the bound element. */
  active: boolean;
  handlers: {
    onDragEnter: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
}

function dragEventHasFiles(e: React.DragEvent): boolean {
  const types = e.dataTransfer?.types;
  if (!types) return false;
  for (let i = 0; i < types.length; i++) {
    if (types[i] === "Files") return true;
  }
  return false;
}

/**
 * Drag-state helpers for a droppable region: an enter/leave counter (so
 * dragging across child elements doesn't flicker the active state) plus a
 * best-effort folder filter on drop. Mirrors the drag bookkeeping already
 * used at the `Chat.tsx` container level so `FileDropZone` behaves the same
 * way for nested composer-scoped drops.
 */
export function useFileDrop({
  onFiles,
  disabled = false,
  rejectFolders = true,
}: UseFileDropOptions): UseFileDropResult {
  const [active, setActive] = useState(false);
  const counterRef = useRef(0);

  const onDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (disabled || !dragEventHasFiles(e)) return;
      e.preventDefault();
      counterRef.current += 1;
      if (counterRef.current === 1) setActive(true);
    },
    [disabled],
  );

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (disabled || !dragEventHasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    },
    [disabled],
  );

  const onDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      counterRef.current = Math.max(0, counterRef.current - 1);
      if (counterRef.current === 0) setActive(false);
    },
    [disabled],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (disabled || !dragEventHasFiles(e)) return;
      e.preventDefault();
      counterRef.current = 0;
      setActive(false);

      const items = e.dataTransfer?.items;
      let files = Array.from(e.dataTransfer?.files ?? []);

      if (rejectFolders && items && items.length === files.length) {
        const folderIndexes = new Set<number>();
        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry?.();
          if (entry && !entry.isFile) folderIndexes.add(i);
        }
        if (folderIndexes.size > 0) {
          files = files.filter((_, idx) => !folderIndexes.has(idx));
        }
      }

      if (files.length > 0) onFiles(files);
    },
    [disabled, onFiles, rejectFolders],
  );

  return { active, handlers: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}

export default useFileDrop;
