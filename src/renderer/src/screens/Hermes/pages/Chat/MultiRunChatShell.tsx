import { useCallback, useEffect, useRef } from "react";
import {
  ChatWorkspaceProvider,
  useChatWorkspace,
} from "@renderer/modules/chat/workspace/ChatWorkspaceProvider";
import {
  BackgroundRunIndicator,
  ChatRunHost,
  ChatRunTabs,
} from "@renderer/modules/chat/workspace/ChatRunTabs";
import { useHermesWorkspace } from "../../context/HermesWorkspaceContext";
import { AiosCopilotChatHost } from "./AiosCopilotChatHost";

function newRunId(): string {
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function MultiRunChatShellInner({
  hideActiveExpertBar,
}: {
  hideActiveExpertBar?: boolean;
}): React.JSX.Element {
  const hermes = useHermesWorkspace();
  const {
    runs,
    activeRunId,
    setActiveRunId,
    openRun,
    closeRun,
    patchRun,
    renameRun,
  } = useChatWorkspace();
  const seededRef = useRef(false);

  useEffect(() => {
    if (runs.length > 0) {
      seededRef.current = true;
      return;
    }
    if (seededRef.current) {
      // Last run closed — open a blank default run.
      openRun({
        runId: newRunId(),
        profileId: hermes.activeProfileId || "default",
        title: "New Chat",
        workMode: hermes.workMode,
      });
      return;
    }
    seededRef.current = true;
    if (hermes.mode === "expert" && hermes.activeExpertId) {
      openRun({
        runId: newRunId(),
        profileId: hermes.activeProfileId || "default",
        sessionId: hermes.activeSessionId,
        mode: "expert",
        expertId: hermes.activeExpertId,
        expertRunId: hermes.activeRunId,
        workMode: hermes.workMode,
        title: "New Chat",
      });
      return;
    }
    if (hermes.mode === "team" && hermes.activeTeamId) {
      openRun({
        runId: newRunId(),
        profileId: hermes.activeProfileId || "default",
        sessionId: hermes.activeSessionId,
        mode: "team",
        teamId: hermes.activeTeamId,
        expertRunId: hermes.activeRunId,
        workMode: hermes.workMode,
        title: "New Chat",
      });
      return;
    }
    openRun({
      runId: newRunId(),
      profileId: hermes.activeProfileId || "default",
      title: "New Chat",
      workMode: hermes.workMode,
    });
  }, [
    hermes.activeExpertId,
    hermes.activeProfileId,
    hermes.activeRunId,
    hermes.activeSessionId,
    hermes.activeTeamId,
    hermes.mode,
    hermes.workMode,
    openRun,
    runs.length,
  ]);

  useEffect(() => {
    if (runs.length === 0) return;
    if (!activeRunId || !runs.some((r) => r.runId === activeRunId)) {
      setActiveRunId(runs[runs.length - 1].runId);
    }
  }, [activeRunId, runs, setActiveRunId]);

  const handleNew = useCallback(() => {
    openRun({
      runId: newRunId(),
      profileId: hermes.activeProfileId || "default",
      title: "New Chat",
      workMode: hermes.workMode,
    });
  }, [hermes.activeProfileId, hermes.workMode, openRun]);

  return (
    <div className="multi-run-chat-shell">
      <ChatRunTabs
        runs={runs}
        activeRunId={activeRunId}
        onSelect={setActiveRunId}
        onClose={closeRun}
        onNew={handleNew}
        onRename={renameRun}
      />
      <BackgroundRunIndicator runs={runs} activeRunId={activeRunId} />
      <div className="multi-run-chat-hosts">
        {runs.map((run) => (
          <ChatRunHost
            key={run.runId}
            runId={run.runId}
            active={run.runId === activeRunId}
          >
            <AiosCopilotChatHost
              run={run}
              active={run.runId === activeRunId}
              onPatchRun={patchRun}
              hideWorkControls={hideActiveExpertBar}
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
