import { useCallback, useEffect, useState } from "react";
import { ChevronRight, File, Folder, RefreshCw, Terminal } from "lucide-react";
import type { ChatWorkspacePort, WorkspaceEntry } from "../../ports/ChatWorkspacePort";

type Props = {
  sessionId: string | null | undefined;
  profileId?: string;
  workspace?: ChatWorkspacePort;
  className?: string;
};

/**
 * PRD v1.6 FR-06 — Worktree panel (directory tree + preview + open terminal).
 * Data from ChatWorkspacePort / Runtime; Open Terminal via validated Runtime path.
 */
export function WorktreePanel({
  sessionId,
  profileId,
  workspace,
  className,
}: Props) {
  const [root, setRoot] = useState<string | null>(null);
  const [entries, setEntries] = useState<WorkspaceEntry[]>([]);
  const [currentPath, setCurrentPath] = useState<string | undefined>(undefined);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessionId || !workspace) return;
    setLoading(true);
    setError(null);
    try {
      const folder = await workspace.getContextFolder(sessionId, profileId);
      setRoot(folder);
      if (!folder) {
        setEntries([]);
        setPreview(null);
        return;
      }
      const list = await workspace.listDirectory(
        sessionId,
        currentPath || folder,
        profileId,
      );
      setEntries(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [currentPath, profileId, sessionId, workspace]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openEntry = useCallback(
    async (entry: WorkspaceEntry) => {
      if (!sessionId || !workspace) return;
      if (entry.kind === "directory") {
        setCurrentPath(entry.path);
        return;
      }
      try {
        const file = await workspace.readFile(sessionId, entry.path, profileId);
        setPreview(file.content ?? "(binary or empty)");
      } catch (err) {
        setPreview(err instanceof Error ? err.message : String(err));
      }
    },
    [profileId, sessionId, workspace],
  );

  const openTerminal = useCallback(async () => {
    if (!sessionId || !workspace?.getTerminalPath) return;
    try {
      const path = await workspace.getTerminalPath(sessionId, profileId);
      if (!path) return;
      // Desktop Native: reveal validated path (Main shell / hermes reveal).
      if (typeof window.chatFiles?.reveal === "function") {
        await window.chatFiles.reveal(path);
      } else if (typeof window.smcShell?.openExternal === "function") {
        await window.smcShell.openExternal(`file://${path}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [profileId, sessionId, workspace]);

  if (!workspace) return null;

  return (
    <div
      className={
        className ||
        "flex h-full min-h-[200px] flex-col border-l border-border/50 bg-background/80 text-xs"
      }
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/40 px-2 py-1.5">
        <span className="font-medium truncate" title={root || undefined}>
          {root ? "Worktree" : "No context folder"}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded p-1 hover:bg-muted disabled:opacity-40"
            disabled={!root || loading}
            onClick={() => void refresh()}
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            className="rounded p-1 hover:bg-muted disabled:opacity-40"
            disabled={!root}
            onClick={() => void openTerminal()}
            title="Open Terminal"
          >
            <Terminal className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {error ? (
        <div className="px-2 py-1 text-destructive">{error}</div>
      ) : null}
      {!root ? (
        <div className="px-2 py-3 text-muted-foreground">
          Bind a context folder to browse the workspace.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <ul className="max-h-48 overflow-auto border-b border-border/30 px-1 py-1">
            {currentPath && root && currentPath !== root ? (
              <li>
                <button
                  type="button"
                  className="flex w-full items-center gap-1 rounded px-1 py-0.5 hover:bg-muted"
                  onClick={() => {
                    const parent = currentPath.replace(/[/\\][^/\\]+$/, "") || root;
                    setCurrentPath(parent);
                  }}
                >
                  <ChevronRight className="h-3 w-3 rotate-180" />
                  ..
                </button>
              </li>
            ) : null}
            {entries.map((e) => (
              <li key={e.path}>
                <button
                  type="button"
                  className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-muted"
                  onClick={() => void openEntry(e)}
                  title={e.path}
                >
                  {e.kind === "directory" ? (
                    <Folder className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <File className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="truncate">{e.name}</span>
                </button>
              </li>
            ))}
          </ul>
          {preview ? (
            <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-2 font-mono text-[11px]">
              {preview}
            </pre>
          ) : null}
        </div>
      )}
    </div>
  );
}
