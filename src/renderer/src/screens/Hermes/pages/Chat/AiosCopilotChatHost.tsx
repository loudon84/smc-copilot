import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { PanelRightOpen } from "lucide-react";
import { ChatSurface } from "@renderer/modules/chat/components/ChatSurface";
import {
  aiosChatRuntimeAdapter,
  aiosSessionAdapter,
  aiosFilesAdapter,
  aiosModelsAdapter,
  aiosNavigationAdapter,
  aiosCommandAdapter,
  composeWorkPrompt,
} from "@renderer/modules/chat/adapters/aios";
import type { ChatRunState } from "@renderer/modules/chat/controller/chatViewTypes";
import type { ChatFileRef } from "@renderer/modules/chat/ports/ChatFilesPort";
import { SessionFilesPanel } from "@renderer/modules/chat/components/session-files/SessionFilesPanel";
import { FilePreviewPanel } from "@renderer/modules/chat/components/files/preview/FilePreviewPanel";
import { useFilePreview } from "@renderer/modules/chat/hooks/files/useFilePreview";
import {
  upsertChatRun,
  patchChatRun,
} from "@renderer/modules/chat/workspace/chatRunRegistry";
import type { ChatTaskStatus } from "./types/chat-task-window";
import { HermesActiveExpertBar } from "./components/HermesActiveExpertBar";
import { TaskStatusBar } from "./components/TaskStatusBar";
import { WorkComposerControls } from "./components/work/WorkComposerControls";
import { PromptHintComposer } from "./components/PromptHintComposer";
import { ChatHeader } from "@renderer/modules/chat/components/ChatHeader";
import { useHermesWorkspace } from "../../context/HermesWorkspaceContext";
import { useWorkChatContext } from "./hooks/useWorkChatContext";

type Props = {
  forcedSessionId?: string | null;
  hideActiveExpertBar?: boolean;
  /** Stable run id from MultiRunChatShell (background streaming isolation). */
  runId?: string;
};

function mapRunStateToTaskStatus(runState: ChatRunState): ChatTaskStatus {
  switch (runState) {
    case "creating":
      return "creating";
    case "streaming":
      return "running";
    case "waiting_approval":
      return "waiting_approval";
    case "waiting_clarify":
      return "waiting_tool";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return "ready";
  }
}

/**
 * Host that mounts Copilot ChatSurface with AI-OS Work slots + adapters.
 * v8.0.2: right-panel tri-state, Work toolbar (no duplicate context bar),
 * Prompt Hint bound to composer input.
 */
export function AiosCopilotChatHost({
  forcedSessionId,
  hideActiveExpertBar,
  runId: runIdProp,
}: Props = {}): React.JSX.Element {
  const workspace = useHermesWorkspace();
  const workContext = useWorkChatContext();
  const profileId = workspace.activeProfileId || "default";
  const showWorkControls = !hideActiveExpertBar;
  const hostRunId = runIdProp || `host-${useId().replace(/:/g, "")}`;

  const [sessionFilesVisible, setSessionFilesVisible] = useState(false);
  const [previewMaximized, setPreviewMaximized] = useState(false);
  const [composerInput, setComposerInput] = useState("");
  const [customPromptHint, setCustomPromptHint] = useState<string | null>(null);
  const filePreview = useFilePreview();

  const sessionId = forcedSessionId ?? workspace.activeSessionId;

  const invocationSource =
    workspace.mode === "expert"
      ? "expert_chat"
      : workspace.mode === "team"
        ? "team_chat"
        : "default_chat";

  useEffect(() => {
    upsertChatRun({
      runId: hostRunId,
      sessionId: sessionId ?? null,
      profileId,
      expertRunId: workspace.activeRunId,
      title: workContext.selectedSkill?.name || "Chat",
      loading: false,
      unread: false,
      completed: false,
    });
  }, [
    hostRunId,
    profileId,
    sessionId,
    workspace.activeRunId,
    workContext.selectedSkill?.name,
  ]);

  const hintInput = useMemo(
    () =>
      workContext.selectedExpert && workContext.selectedSkill
        ? {
            expertName: workContext.selectedExpert.name,
            expertId: workContext.selectedExpert.expertId,
            skillName: workContext.selectedSkill.name,
            permissionMode: workContext.permissionMode,
          }
        : null,
    [
      workContext.selectedExpert,
      workContext.selectedSkill,
      workContext.permissionMode,
    ],
  );

  const composeMessage = useCallback(
    (raw: string) => {
      if (customPromptHint && customPromptHint.trim()) {
        return customPromptHint.trim();
      }
      return composeWorkPrompt({
        userMessage: raw,
        selectedExpert: workContext.selectedExpert,
        selectedSkill: workContext.selectedSkill,
        permissionMode: workContext.permissionMode,
      });
    },
    [
      customPromptHint,
      workContext.selectedExpert,
      workContext.selectedSkill,
      workContext.permissionMode,
    ],
  );

  const showRightPanel = sessionFilesVisible || filePreview.state.open;

  return (
    <ChatSurface
      runtime={aiosChatRuntimeAdapter}
      session={aiosSessionAdapter}
      files={aiosFilesAdapter}
      models={aiosModelsAdapter}
      navigation={aiosNavigationAdapter}
      commands={aiosCommandAdapter}
      profileId={profileId}
      sessionId={sessionId}
      runId={hostRunId}
      expertId={workspace.activeExpertId}
      teamId={workspace.activeTeamId}
      expertRunId={workspace.activeRunId}
      workMode={workspace.workMode}
      permissionMode={workContext.permissionMode}
      invocationSource={invocationSource}
      composeMessage={composeMessage}
      onInputChange={setComposerInput}
      onSessionIdChange={(id) => {
        workspace.setActiveSessionId(id);
        patchChatRun(hostRunId, { sessionId: id });
      }}
      onRuntimeCommand={(command) => {
        const runId = hostRunId;
        if (command.type === "clarify.respond") {
          void aiosChatRuntimeAdapter.command?.({
            type: "clarify.respond",
            runId,
            requestId: command.requestId,
            answer: command.answer || "",
          });
        } else if (command.type === "approval.approve") {
          void aiosChatRuntimeAdapter.command?.({
            type: "approval.approve",
            runId,
            requestId: command.requestId,
          });
        } else {
          void aiosChatRuntimeAdapter.command?.({
            type: "approval.deny",
            runId,
            requestId: command.requestId,
            reason: command.reason,
          });
        }
      }}
      activeExpertSlot={
        showWorkControls ? (
          <>
            <ChatHeader
              expertName={workContext.selectedExpert?.name}
              workMode={workspace.workMode}
              onReturnDefault={() => {
                /* workspace clears active expert via HermesActiveExpertBar */
              }}
              onWorkModeChange={(mode) => workspace.setWorkMode(mode)}
            />
            <HermesActiveExpertBar />
          </>
        ) : null
      }
      renderStatusBar={({ runState, toolProgress }) => {
        const status = mapRunStateToTaskStatus(runState);
        if (status === "ready") return null;
        return (
          <TaskStatusBar
            title={workContext.selectedSkill?.name || "Chat"}
            status={status}
            expertName={workContext.selectedExpert?.name}
            skillName={workContext.selectedSkill?.name}
            profileId={profileId}
            durationMs={0}
            toolLabel={toolProgress || undefined}
          />
        );
      }}
      composerControlsSlot={
        showWorkControls ? (
          <div className="aios-work-composer-toolbar">
            <WorkComposerControls context={workContext} />
            <PromptHintComposer
              userMessage={composerInput}
              hintInput={hintInput}
              onHintChange={setCustomPromptHint}
            />
          </div>
        ) : null
      }
      filesToggleSlot={
        <button
          type="button"
          className="copilot-icon-btn"
          title="Session files"
          onClick={() => setSessionFilesVisible((v) => !v)}
        >
          <PanelRightOpen size={16} />
        </button>
      }
      showRightPanel={showRightPanel}
      filesPanelSlot={
        showRightPanel ? (
          <>
            {sessionFilesVisible && (
              <SessionFilesPanel
                files={aiosFilesAdapter}
                sessionId={sessionId}
                profileId={profileId}
                onPreview={(f: ChatFileRef) => {
                  setPreviewMaximized(false);
                  void filePreview.openPreview(f.id, profileId);
                }}
                onClose={() => setSessionFilesVisible(false)}
              />
            )}
            {filePreview.state.open ? (
              <FilePreviewPanel
                state={filePreview.state}
                profile={profileId}
                sessionId={sessionId ?? undefined}
                maximized={previewMaximized}
                onToggleMaximized={() => setPreviewMaximized((v) => !v)}
                onClose={() => {
                  filePreview.closePreview();
                  setPreviewMaximized(false);
                }}
                onRetry={() => filePreview.retry()}
                onLoadMore={() => {
                  void filePreview.loadMore();
                }}
                onMessageFileCreated={(fileId) => {
                  void filePreview.openPreview(fileId, profileId);
                }}
              />
            ) : null}
          </>
        ) : null
      }
    />
  );
}

export default AiosCopilotChatHost;
