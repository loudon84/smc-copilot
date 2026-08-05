import { useCallback, useEffect, useId, useState } from "react";
import { ChatSurface } from "@renderer/modules/chat/components/ChatSurface";
import {
  aiosChatRuntimeAdapter,
  aiosSessionAdapter,
  aiosFilesAdapter,
  aiosModelsAdapter,
  aiosNavigationAdapter,
  composeWorkPrompt,
} from "@renderer/modules/chat/adapters/aios";
import type { ChatRunState } from "@renderer/modules/chat/controller/chatViewTypes";
import type { ChatFileRef } from "@renderer/modules/chat/ports/ChatFilesPort";
import { SessionFilesPanel } from "@renderer/modules/chat/components/session-files/SessionFilesPanel";
import { FilePreviewPanel } from "@renderer/modules/chat/components/session-files/FilePreviewPanel";
import {
  upsertChatRun,
  patchChatRun,
} from "@renderer/modules/chat/workspace/chatRunRegistry";
import type { ChatTaskStatus } from "./types/chat-task-window";
import { HermesActiveExpertBar } from "./components/HermesActiveExpertBar";
import { TaskStatusBar } from "./components/TaskStatusBar";
import { WorkChatContextBar } from "./components/work/WorkChatContextBar";
import { WorkComposerControls } from "./components/work/WorkComposerControls";
import { PromptHintComposer } from "./components/PromptHintComposer";
import { useHermesWorkspace } from "../../context/HermesWorkspaceContext";
import { useWorkChatContext } from "./hooks/useWorkChatContext";

type Props = {
  forcedSessionId?: string | null;
  hideActiveExpertBar?: boolean;
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
 */
export function AiosCopilotChatHost({
  forcedSessionId,
  hideActiveExpertBar,
}: Props = {}): React.JSX.Element {
  const workspace = useHermesWorkspace();
  const workContext = useWorkChatContext();
  const profileId = workspace.activeProfileId || "default";
  const showWorkControls = !hideActiveExpertBar;
  const hostRunId = `host-${useId().replace(/:/g, "")}`;
  const [previewFile, setPreviewFile] = useState<ChatFileRef | null>(null);

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

  const composeMessage = useCallback(
    (raw: string) =>
      composeWorkPrompt({
        userMessage: raw,
        selectedExpert: workContext.selectedExpert,
        selectedSkill: workContext.selectedSkill,
        permissionMode: workContext.permissionMode,
      }),
    [
      workContext.selectedExpert,
      workContext.selectedSkill,
      workContext.permissionMode,
    ],
  );

  return (
    <ChatSurface
      runtime={aiosChatRuntimeAdapter}
      session={aiosSessionAdapter}
      files={aiosFilesAdapter}
      models={aiosModelsAdapter}
      navigation={aiosNavigationAdapter}
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
      activeExpertSlot={showWorkControls ? <HermesActiveExpertBar /> : null}
      renderStatusBar={({ runState, toolProgress }) => (
        <TaskStatusBar
          title={workContext.selectedSkill?.name || "Chat"}
          status={mapRunStateToTaskStatus(runState)}
          expertName={workContext.selectedExpert?.name}
          skillName={workContext.selectedSkill?.name}
          profileId={profileId}
          durationMs={0}
          toolLabel={toolProgress || undefined}
        />
      )}
      contextBarSlot={
        showWorkControls ? (
          <>
            <WorkChatContextBar context={workContext} />
            <PromptHintComposer
              userMessage=""
              hintInput={
                workContext.selectedExpert && workContext.selectedSkill
                  ? {
                      expertName: workContext.selectedExpert.name,
                      expertId: workContext.selectedExpert.expertId,
                      skillName: workContext.selectedSkill.name,
                      permissionMode: workContext.permissionMode,
                    }
                  : null
              }
            />
          </>
        ) : null
      }
      composerControlsSlot={
        showWorkControls ? <WorkComposerControls context={workContext} /> : null
      }
      filesPanelSlot={
        <>
          <SessionFilesPanel
            files={aiosFilesAdapter}
            sessionId={sessionId}
            profileId={profileId}
            onPreview={setPreviewFile}
          />
          <FilePreviewPanel
            files={aiosFilesAdapter}
            file={previewFile}
            profileId={profileId}
            onClose={() => setPreviewFile(null)}
          />
        </>
      }
    />
  );
}

export default AiosCopilotChatHost;
