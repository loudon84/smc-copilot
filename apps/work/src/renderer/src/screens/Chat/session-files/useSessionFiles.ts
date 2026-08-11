/**
 * Loads and groups session-scoped managed files for the Session Files panel.
 */

import { useCallback, useEffect, useState } from "react";
import type {
  FileAssociationRole,
  FileDomainEvent,
  ManagedFileView,
} from "../../../../../shared/files";
import {
  addFileToSessionContext,
  listSessionManagedFiles,
  removeFileFromSessionContext,
} from "./session-file-actions";

export interface SessionFileGroups {
  attachments: ManagedFileView[];
  contextFiles: ManagedFileView[];
  agentOutput: ManagedFileView[];
  other: ManagedFileView[];
}

export interface UseSessionFilesResult {
  files: ManagedFileView[];
  groups: SessionFileGroups;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addToContext: (fileId: string) => Promise<void>;
  removeFromContext: (fileId: string) => Promise<void>;
}

function emptyGroups(): SessionFileGroups {
  return {
    attachments: [],
    contextFiles: [],
    agentOutput: [],
    other: [],
  };
}

function groupFiles(files: ManagedFileView[]): SessionFileGroups {
  const groups = emptyGroups();
  for (const file of files) {
    const role = file.associationRole as FileAssociationRole | undefined;
    if (role === "prompt-attachment" || role === "message-attachment") {
      groups.attachments.push(file);
    } else if (role === "context-file") {
      groups.contextFiles.push(file);
    } else if (role === "agent-output") {
      groups.agentOutput.push(file);
    } else {
      groups.other.push(file);
    }
  }
  return groups;
}

function eventMatchesSession(
  event: FileDomainEvent,
  sessionId: string,
): boolean {
  if (event.type === "file:updated") return false;
  return event.sessionId === sessionId;
}

// @lat: [[session-file-context#Session Files Panel]]
export function useSessionFiles(
  profile: string | undefined,
  sessionId: string | null | undefined,
): UseSessionFilesResult {
  const [files, setFiles] = useState<ManagedFileView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setFiles([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await listSessionManagedFiles(profile, sessionId);
      setFiles(rows || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [profile, sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!sessionId) return;
    const api = window.hermesAPI?.files;
    if (!api?.onFileDomainEvent) return;
    return api.onFileDomainEvent((event) => {
      if (eventMatchesSession(event, sessionId)) {
        void refresh();
      }
    });
  }, [sessionId, refresh]);

  const addToContext = useCallback(
    async (fileId: string) => {
      if (!sessionId) return;
      await addFileToSessionContext({
        profile,
        sessionId,
        fileId,
      });
      await refresh();
    },
    [profile, sessionId, refresh],
  );

  const removeFromContext = useCallback(
    async (fileId: string) => {
      if (!sessionId) return;
      await removeFileFromSessionContext({
        profile,
        sessionId,
        fileId,
      });
      await refresh();
    },
    [profile, sessionId, refresh],
  );

  return {
    files,
    groups: groupFiles(files),
    loading,
    error,
    refresh,
    addToContext,
    removeFromContext,
  };
}

export default useSessionFiles;
