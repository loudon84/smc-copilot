/**
 * Subscribe to Main FileJobEvent push and map them onto ManagedFileStatus.
 */

import { useEffect } from "react";
import type {
  FileJobEvent,
  ManagedFileStatus,
} from "@shared/chat-files";

export type StatusByIdUpdater = (
  updater: (
    prev: Record<string, ManagedFileStatus>,
  ) => Record<string, ManagedFileStatus>,
) => void;

function statusFromEvent(event: FileJobEvent): ManagedFileStatus | null {
  switch (event.type) {
    case "file-job:started":
    case "file-job:progress":
      return "parsing";
    case "file-job:completed":
      return "parsed";
    case "file-job:failed":
      return "failed";
    default:
      return null;
  }
}

/**
 * Keep composer `statusById` in sync with parse jobs.
 * Only updates ids already present in the map (or optionally tracked set).
 */
// @lat: [[file-platform#File job queue]]
export function useFileJobEvents(
  setStatusById: StatusByIdUpdater,
  options?: {
    /** When set, only apply events for these attachment/file ids. */
    trackedIds?: Set<string> | string[];
    onFailed?: (fileId: string, message: string) => void;
  },
): void {
  const tracked = options?.trackedIds;
  const onFailed = options?.onFailed;

  useEffect(() => {
    const filesApi = window.chatFiles?.platform;
    if (!filesApi?.onFileJobEvent) return;

    const unsubscribe = filesApi.onFileJobEvent((event) => {
      const nextStatus = statusFromEvent(event);
      if (!nextStatus) return;

      if (tracked) {
        const allowed =
          tracked instanceof Set
            ? tracked.has(event.fileId)
            : tracked.includes(event.fileId);
        if (!allowed) return;
      }

      setStatusById((prev) => {
        // Ignore events for files the composer is not showing unless trackedIds
        // was omitted (then only update keys already known).
        if (!tracked && !(event.fileId in prev)) return prev;
        if (prev[event.fileId] === nextStatus) return prev;
        return { ...prev, [event.fileId]: nextStatus };
      });

      if (event.type === "file-job:failed" && onFailed) {
        onFailed(event.fileId, event.error.message);
      }
    });

    return unsubscribe;
  }, [setStatusById, tracked, onFailed]);
}

export default useFileJobEvents;
