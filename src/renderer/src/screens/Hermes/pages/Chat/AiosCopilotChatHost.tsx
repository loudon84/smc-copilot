import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatSurface } from "@renderer/modules/chat/components/ChatSurface";
import type { ControllerStateChangeSnapshot } from "@renderer/modules/chat/components/ChatSurface";
import {
  aiosChatRuntimeAdapter,
  aiosSessionAdapter,
  aiosFilesAdapter,
  aiosModelsAdapter,
  aiosNavigationAdapter,
  aiosCommandAdapter,
  composeWorkPrompt,
} from "@renderer/modules/chat/adapters/aios";
import type { ChatFileRef } from "@renderer/modules/chat/ports/ChatFilesPort";
import { SessionFilesPanel } from "@renderer/modules/chat/components/session-files/SessionFilesPanel";
import { FilePreviewPanel } from "@renderer/modules/chat/components/files/preview/FilePreviewPanel";
import { useFilePreview } from "@renderer/modules/chat/hooks/files/useFilePreview";
import { ChatRunHeader } from "@renderer/modules/chat/components/header/ChatRunHeader";
import { ChatRunStatus } from "@renderer/modules/chat/components/header/ChatRunStatus";
import { WorkContextChip } from "@renderer/modules/chat/components/composer/WorkContextChip";
import { WorkContextPopover } from "@renderer/modules/chat/components/composer/WorkContextPopover";
import {
  PromptAssistPanel,
  resolveEffectivePromptHint,
} from "@renderer/modules/chat/components/composer/PromptAssistPanel";
import { ComposerMoreMenu } from "@renderer/modules/chat/components/composer/ComposerMoreMenu";
import type {
  ChatRunRecord,
  DeepPartial,
  PromptHintState,
} from "@renderer/modules/chat/workspace/ChatRunRecord";
import {
  useRunWorkContext,
  setRunWorkGatewayHealthApi,
} from "@renderer/modules/chat/workspace/useRunWorkContext";
import { useChatWorkspace } from "@renderer/modules/chat/workspace/ChatWorkspaceProvider";
import {
  buildExpertPromptHint,
  shouldBuildExpertPromptHint,
} from "./utils/buildExpertPromptHint";
import { ExpertSelector } from "./components/work/ExpertSelector";
import { ExpertSkillSelector } from "./components/work/ExpertSkillSelector";
import { PermissionSelector } from "./components/work/PermissionSelector";
import { GatewayStatusBadge } from "./components/work/GatewayStatusBadge";
import { workExpertGatewayApi } from "../../api/workExpertGatewayApi";
import type { UseWorkChatContextReturn } from "../../types/work-chat";

setRunWorkGatewayHealthApi({
  getHealth: () => workExpertGatewayApi.getHealth(),
});

type Props = {
  run: ChatRunRecord;
  active: boolean;
  onPatchRun: (runId: string, patch: DeepPartial<ChatRunRecord>) => void;
  hideWorkControls?: boolean;
};

function useComposerDensity(): "full" | "expert" | "icon" {
  const [width, setWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  if (width >= 1280) return "full";
  if (width >= 960) return "expert";
  return "icon";
}

/**
 * Host that mounts Copilot ChatSurface with AI-OS Work slots + adapters.
 * v8.0.3: per-run state via ChatRunRecord; single header; compact composer.
 */
export function AiosCopilotChatHost({
  run,
  active,
  onPatchRun,
  hideWorkControls,
}: Props): React.JSX.Element {
  const workContext = useRunWorkContext(run.runId);
  const { applyControllerSnapshot } = useChatWorkspace();
  const density = useComposerDensity();
  const showWorkControls = !hideWorkControls;
  const profileId = run.identity.profileId || "default";
  const sessionId = run.identity.sessionId;

  const filePreview = useFilePreview();

  // Sync panel visibility with run presentation
  const sessionFilesVisible = run.presentation.sessionFilesVisible;
  const previewMaximized = run.presentation.previewMaximized;

  const setSessionFilesVisible = useCallback(
    (visible: boolean | ((prev: boolean) => boolean)) => {
      const next =
        typeof visible === "function"
          ? visible(run.presentation.sessionFilesVisible)
          : visible;
      onPatchRun(run.runId, {
        presentation: { sessionFilesVisible: next },
      });
    },
    [onPatchRun, run.presentation.sessionFilesVisible, run.runId],
  );

  const setPreviewMaximized = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      const next =
        typeof value === "function"
          ? value(run.presentation.previewMaximized)
          : value;
      onPatchRun(run.runId, {
        presentation: { previewMaximized: next },
      });
    },
    [onPatchRun, run.presentation.previewMaximized, run.runId],
  );

  const [composerInput, setComposerInput] = useState(
    run.presentation.draft || "",
  );

  useEffect(() => {
    setComposerInput(run.presentation.draft || "");
  }, [run.runId]); // eslint-disable-line react-hooks/exhaustive-deps -- reset draft on run switch only

  const promptHintState: PromptHintState = run.presentation.promptHint ?? {
    mode: "auto",
  };

  const setPromptHintState = useCallback(
    (next: PromptHintState) => {
      onPatchRun(run.runId, { presentation: { promptHint: next } });
    },
    [onPatchRun, run.runId],
  );

  const selectorContext = workContext as unknown as UseWorkChatContextReturn;

  const autoHint = useMemo(() => {
    if (
      !workContext.selectedExpert ||
      !workContext.selectedSkill ||
      !shouldBuildExpertPromptHint({
        expertName: workContext.selectedExpert.name,
        skillName: workContext.selectedSkill.name,
      })
    ) {
      return "";
    }
    return buildExpertPromptHint({
      userMessage: composerInput.trim() || "(empty message)",
      expertName: workContext.selectedExpert.name,
      expertId: workContext.selectedExpert.expertId,
      skillName: workContext.selectedSkill.name,
      permissionMode: workContext.permissionMode,
    });
  }, [
    composerInput,
    workContext.permissionMode,
    workContext.selectedExpert,
    workContext.selectedSkill,
  ]);

  const composeMessage = useCallback(
    (raw: string) => {
      const auto =
        workContext.selectedExpert && workContext.selectedSkill
          ? composeWorkPrompt({
              userMessage: raw,
              selectedExpert: workContext.selectedExpert,
              selectedSkill: workContext.selectedSkill,
              permissionMode: workContext.permissionMode,
            })
          : raw;
      return resolveEffectivePromptHint(promptHintState, auto, raw);
    },
    [
      promptHintState,
      workContext.permissionMode,
      workContext.selectedExpert,
      workContext.selectedSkill,
    ],
  );

  const headerLabel =
    run.context.mode === "team"
      ? run.context.teamName || run.context.teamId || "Team"
      : run.context.mode === "expert"
        ? run.context.expertName || run.context.expertId || "Expert"
        : "Hermes Default";

  const handleControllerState = useCallback(
    (snapshot: ControllerStateChangeSnapshot) => {
      applyControllerSnapshot(
        {
          runId: run.runId,
          sessionId: snapshot.sessionId,
          runState: snapshot.runState,
          selectedModelId: snapshot.selectedModelId,
          firstUserPrompt: snapshot.firstUserPrompt,
        },
        active,
      );
    },
    [active, applyControllerSnapshot, run.runId],
  );

  const handleInputChange = useCallback(
    (value: string) => {
      setComposerInput(value);
      onPatchRun(run.runId, { presentation: { draft: value } });
    },
    [onPatchRun, run.runId],
  );

  const showRightPanel =
    sessionFilesVisible || filePreview.state.open;

  const emptyContext = useMemo(() => {
    if (run.context.mode === "team") {
      return {
        teamName: run.context.teamName || run.context.teamId,
        description: "Coordinate with your team on the next deliverable.",
      };
    }
    if (run.context.mode === "expert" && run.context.expertName) {
      const suggestions = run.context.skillName
        ? [
            {
              text: `Use skill ${run.context.skillName} to analyze this`,
              label: run.context.skillDisplayName || run.context.skillName,
            },
            {
              text: `Ask ${run.context.expertName} for a step-by-step plan`,
            },
            {
              text: `Summarize key risks for ${run.context.expertName}`,
            },
          ]
        : undefined;
      return {
        expertName: run.context.expertName,
        description: `Ask ${run.context.expertName} to help with your next task.`,
        suggestions,
      };
    }
    return undefined;
  }, [run.context]);

  const contextPopover = (
    <WorkContextPopover onClear={workContext.clearContext}>
      <GatewayStatusBadge status={workContext.gatewayStatus} />
      <ExpertSelector context={selectorContext} />
      <ExpertSkillSelector context={selectorContext} />
      <PermissionSelector context={selectorContext} />
    </WorkContextPopover>
  );

  const workChip = showWorkControls ? (
    <WorkContextChip
      expertName={workContext.selectedExpert?.name}
      skillName={
        workContext.selectedSkill?.displayName ||
        workContext.selectedSkill?.name
      }
      gatewayStatus={workContext.gatewayStatus}
      density={density === "full" ? "full" : density === "expert" ? "expert" : "icon"}
    >
      {contextPopover}
    </WorkContextChip>
  ) : null;

  const promptHintControl = showWorkControls ? (
    <PromptAssistPanel
      state={promptHintState}
      autoHint={autoHint}
      density={density === "icon" ? "icon" : "full"}
      onChange={setPromptHintState}
    />
  ) : null;

  const composerControls =
    showWorkControls && density === "icon" ? (
      <div className="aios-work-composer-toolbar aios-work-composer-toolbar--compact">
        {workChip}
        <ComposerMoreMenu>
          {promptHintControl}
        </ComposerMoreMenu>
      </div>
    ) : showWorkControls ? (
      <div className="aios-work-composer-toolbar">
        {workChip}
        {promptHintControl}
      </div>
    ) : null;

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
      initialDraft={run.presentation.draft || ""}
      runId={run.runId}
      expertId={run.context.expertId}
      teamId={run.context.teamId}
      expertRunId={run.execution.expertRunId}
      workMode={run.context.workMode}
      permissionMode={run.context.permissionMode}
      invocationSource={run.execution.invocationSource}
      composeMessage={composeMessage}
      onInputChange={handleInputChange}
      emptyContext={emptyContext}
      onSessionIdChange={(id) => {
        onPatchRun(run.runId, { identity: { sessionId: id } });
      }}
      onControllerStateChange={handleControllerState}
      onRuntimeCommand={(command) => {
        const runId = run.runId;
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
          <ChatRunHeader
            mode={run.context.mode}
            label={headerLabel}
            skillName={run.context.skillName}
            skillDisplayName={run.context.skillDisplayName}
            workMode={run.context.workMode}
            showReturnDefault={run.context.mode !== "default"}
            onReturnDefault={() => workContext.clearContext()}
            onWorkModeChange={(mode) => workContext.setWorkMode(mode)}
          />
        ) : null
      }
      renderStatusBar={({ runState, toolProgress, usage }) => (
        <ChatRunStatus
          runState={runState}
          toolLabel={toolProgress}
          usage={usage}
          startedAt={run.execution.startedAt}
        />
      )}
      composerControlsSlot={composerControls}
      sessionFilesActive={sessionFilesVisible}
      sessionFilesCount={0}
      onToggleSessionFiles={() => setSessionFilesVisible((v) => !v)}
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
