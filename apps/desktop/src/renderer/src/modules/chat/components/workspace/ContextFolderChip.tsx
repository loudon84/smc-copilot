import { useCallback, useEffect, useState } from "react";
import { FolderOpen, X } from "lucide-react";
import type { ChatWorkspacePort } from "../../ports/ChatWorkspacePort";

type Props = {
  sessionId: string | null | undefined;
  profileId?: string;
  workspace?: ChatWorkspacePort;
  onChanged?: (folder: string | null) => void;
};

/**
 * PRD v1.6 FR-04 — Context Folder chip.
 * Picker uses Desktop native dialog via hermesAPI.selectFolder (Native API OK);
 * persistence goes through Runtime chat-settings.
 */
export function ContextFolderChip({
  sessionId,
  profileId,
  workspace,
  onChanged,
}: Props) {
  const [folder, setFolder] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!sessionId || !workspace?.getContextFolder) {
        setFolder(null);
        return;
      }
      try {
        const next = await workspace.getContextFolder(sessionId, profileId);
        if (!cancelled) setFolder(next);
      } catch {
        if (!cancelled) setFolder(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, profileId, workspace]);

  const pick = useCallback(async () => {
    if (!sessionId || !workspace?.setContextFolder) return;
    setBusy(true);
    try {
      const result = await window.hermesAPI.showOpenDialog({
        properties: ["openDirectory"],
      });
      const selected = result.canceled ? null : result.filePaths?.[0] || null;
      if (!selected) return;
      await workspace.setContextFolder(sessionId, selected, profileId);
      setFolder(selected);
      onChanged?.(selected);
    } finally {
      setBusy(false);
    }
  }, [onChanged, profileId, sessionId, workspace]);

  const clear = useCallback(async () => {
    if (!sessionId || !workspace?.setContextFolder) return;
    setBusy(true);
    try {
      await workspace.setContextFolder(sessionId, null, profileId);
      setFolder(null);
      onChanged?.(null);
    } finally {
      setBusy(false);
    }
  }, [onChanged, profileId, sessionId, workspace]);

  if (!workspace) return null;

  const label = folder
    ? folder.replace(/^.*[/\\]/, "") || folder
    : "Set context folder";

  return (
    <div className="flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-xs">
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground disabled:opacity-50"
        disabled={busy || !sessionId}
        onClick={() => void pick()}
        title={folder || "Bind a workspace folder for this session"}
      >
        <FolderOpen className="h-3.5 w-3.5" />
        <span className="max-w-[160px] truncate">{label}</span>
      </button>
      {folder ? (
        <button
          type="button"
          className="rounded p-0.5 hover:bg-muted disabled:opacity-50"
          disabled={busy}
          onClick={() => void clear()}
          aria-label="Clear context folder"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}
