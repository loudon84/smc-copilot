import { useCallback, useEffect, useState } from "react";
import {
  ChatWorkspaceProvider,
  useChatWorkspace,
} from "@renderer/modules/chat/workspace/ChatWorkspaceProvider";
import {
  BackgroundRunIndicator,
  ChatRunHost,
  ChatRunTabs,
} from "@renderer/modules/chat/workspace/ChatRunTabs";
import { AiosCopilotChatHost } from "./AiosCopilotChatHost";

function newRunId(): string {
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function MultiRunChatShellInner({
  hideActiveExpertBar,
}: {
  hideActiveExpertBar?: boolean;
}): React.JSX.Element {
  const {
    runs,
    activeRunId,
    setActiveRunId,
    openRun,
    closeRun,
  } = useChatWorkspace();
  const [mountedIds, setMountedIds] = useState<string[]>([]);

  useEffect(() => {
    if (mountedIds.length > 0) return;
    const id = newRunId();
    openRun({
      runId: id,
      profileId: "default",
      title: "Chat",
    });
    setMountedIds([id]);
  }, [mountedIds.length, openRun]);

  useEffect(() => {
    setMountedIds((prev) => {
      const next = new Set(prev);
      for (const r of runs) next.add(r.runId);
      return [...next];
    });
  }, [runs]);

  const handleNew = useCallback(() => {
    const id = newRunId();
    openRun({ runId: id, profileId: "default", title: "Chat" });
    setMountedIds((prev) => [...prev, id]);
  }, [openRun]);

  const handleClose = useCallback(
    (runId: string) => {
      closeRun(runId);
      setMountedIds((prev) => {
        const next = prev.filter((id) => id !== runId);
        if (next.length === 0) {
          const id = newRunId();
          openRun({ runId: id, profileId: "default", title: "Chat" });
          return [id];
        }
        if (activeRunId === runId && next[0]) {
          setActiveRunId(next[0]);
        }
        return next;
      });
    },
    [activeRunId, closeRun, openRun, setActiveRunId],
  );

  return (
    <div className="multi-run-chat-shell">
      <ChatRunTabs
        runs={runs}
        activeRunId={activeRunId}
        onSelect={setActiveRunId}
        onClose={handleClose}
        onNew={handleNew}
      />
      <BackgroundRunIndicator runs={runs} activeRunId={activeRunId} />
      <div className="multi-run-chat-hosts">
        {mountedIds.map((runId) => (
          <ChatRunHost
            key={runId}
            runId={runId}
            active={runId === activeRunId}
          >
            <AiosCopilotChatHost
              hideActiveExpertBar={hideActiveExpertBar}
              runId={runId}
            />
          </ChatRunHost>
        ))}
      </div>
    </div>
  );
}

/**
 * Multi-chat workspace — keeps multiple AiosCopilotChatHost mounts alive
 * for background streaming; switches visibility via ChatRunHost.
 */
export function MultiRunChatShell(
  props: { hideActiveExpertBar?: boolean } = {},
): React.JSX.Element {
  return (
    <ChatWorkspaceProvider>
      <MultiRunChatShellInner {...props} />
    </ChatWorkspaceProvider>
  );
}

export default MultiRunChatShell;
